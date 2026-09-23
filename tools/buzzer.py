"""Genera el audio del zumbador en assets/audio/.

El sonido esta sintetizado, no grabado. Un zumbador de red es una lengueta que
una bobina atrae dos veces por ciclo; cada tiron es un golpe, con un click de
contacto blando y un puñado de modos mecanicos que resuenan. Los golpes
consecutivos no son identicos, asi que el contenido brillante lleva bandas
laterales a la frecuencia de red mientras los modos graves repiten al doble.
Esa asimetria es lo que hace que un zumbador suene a zumbador y no a tono.

El periodo se construye plegando la cola sobre si misma, asi que el tramo
sostenido es exactamente periodico en 735 muestras y repite sin costura por
construccion. La lengueta igual arranca desde el reposo: los modos pesados
tardan mas en llegar a su excursion completa que los livianos, y por eso los
primeros 300 ms no son loopeables y src/js/loop.js tiene que buscar la meseta.

    uv run --with numpy python tools/buzzer.py

Necesita numpy, y ffmpeg en el PATH para los encodes a Ogg y AAC.
"""

import os
import struct
import subprocess
import numpy as np

SR = 44100
MAINS = 60.0
PERIOD = int(round(SR / MAINS))     # 735 muestras, exacto
STRIKE_FORCE = (1.00, 0.85)         # los dos golpes de cada ciclo de red

# frecuencia Hz, caida ms, peso, fuerza por golpe
MODES = [
    (125.0, 34.0, 0.70, (1.00, 1.00)),
    (358.0, 24.0, 0.69, (1.00, 0.96)),
    (486.0, 17.0, 0.52, (1.00, 0.90)),
    (838.0, 13.0, 0.95, (1.00, 0.78)),
    (1618.0, 9.0, 3.94, (1.00, 0.92)),
    (3180.0, 5.0, 2.14, (1.00, 0.92)),
]
CLICK_WEIGHT = 0.45
CLICK_WIDTH_MS = 0.75   # el contacto es blando, no un pico
CLICK_HZ = 1200.0
HEAVY_HZ = 300.0        # por debajo de esto estan los modos que tardan en armarse
TILT_HZ = 2400.0
RING_PERIODS = 24
WARMUP_PERIODS = 12
DURATION = 0.65
SPINUP_MS = 120.0
SPINUP_FLOOR = 0.62     # cuanto de los modos pesados ya esta ahi en t=0
ATTACK_MS = 8.0
FADE_IN_MS = 2.0
FADE_OUT_MS = 8.0

STEADY_FROM = 0.35
TARGET_DBA = -22.14     # nivel sostenido, ponderado A; audio.js no agrega ganancia

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'audio')


def strike_offsets(count):
    return [int(round(i * PERIOD / count)) for i in range(count)]


def modal_body(modes):
    """Un periodo exactamente periodico, plegando la cola de cada modo.

    Un modo resuena mas de un periodo, asi que el estado estacionario de un
    zumbador sostenido es la suma de todos los golpes anteriores que siguen
    sonando. Plegar la cola dentro de un solo periodo reproduce ese estado
    estacionario exacto.
    """
    span = PERIOD * RING_PERIODS
    total = np.zeros(span)
    for freq, decay_ms, weight, forces in modes:
        for offset, force in zip(strike_offsets(len(forces)), forces):
            t = np.arange(span - offset) / SR
            ring = np.exp(-t / (decay_ms / 1000.0)) * np.sin(2 * np.pi * freq * t)
            total[offset:] += force * weight * ring
    return total.reshape(-1, PERIOD).sum(axis=0)


def click_body():
    """El click del contacto, un pulso blando por golpe.

    Rellena los armonicos a los que los modos, angostos, no llegan solos. Un
    impulso pelado haria lo mismo, pero ademas cae como un pico de una muestra:
    todo el factor de cresta, mas una cola ultrasonica que el original no tiene.
    """
    sigma = SR * CLICK_WIDTH_MS / 1000.0
    index = np.arange(PERIOD)
    period = np.zeros(PERIOD)
    for offset, force in zip(strike_offsets(len(STRIKE_FORCE)), STRIKE_FORCE):
        distance = np.minimum(np.abs(index - offset), PERIOD - np.abs(index - offset))
        period += force * np.exp(-0.5 * (distance / sigma) ** 2)
    return period


def periodic_lowpass(period, cutoff):
    """Pasabajos de un polo que deja el periodo periodico.

    Filtrar un periodo suelto deja el estado del filtro discontinuo en el
    empalme, y eso pondria un escalon justo en el punto del bucle. Correr el
    filtro sobre varias repeticiones y quedarse con la ultima lo deja asentado.
    """
    decay = np.exp(-2 * np.pi * cutoff / SR)
    x = np.tile(period, WARMUP_PERIODS)
    out = np.empty_like(x)
    value = 0.0
    for i, sample in enumerate(x):
        value = (1 - decay) * sample + decay * value
        out[i] = value
    return out[-PERIOD:]


def tile(period, frames):
    return np.tile(period, frames // len(period) + 1)[:frames]


def rms(x):
    return float(np.sqrt((x ** 2).mean()))


def a_weighted_rms(x):
    """Nivel como lo lee el oido, segun IEC 61672.

    El RMS crudo es la medida equivocada aca: el oido es mucho mas sensible
    cerca de los 3 kHz que en los 120 Hz, asi que dos versiones al mismo RMS
    pueden quedar muy distintas de volumen. Ponderar primero deja el nivel
    percibido quieto mientras se retocan los modos.
    """
    freq = np.fft.rfftfreq(len(x), 1 / SR)
    f2 = np.square(freq)
    numerator = (12194.0 ** 2) * f2 ** 2
    denominator = ((f2 + 20.6 ** 2)
                   * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2))
                   * (f2 + 12194.0 ** 2))
    with np.errstate(divide='ignore', invalid='ignore'):
        curve = np.where(denominator > 0, numerator / denominator, 0.0)
    curve *= 10 ** (2.0 / 20)       # 0 dB en 1 kHz
    return rms(np.fft.irfft(np.fft.rfft(x) * curve, len(x)))


def build():
    frames = int(SR * DURATION)
    t = np.arange(frames) / SR

    heavy = periodic_lowpass(modal_body([m for m in MODES if m[0] < HEAVY_HZ]), TILT_HZ)
    light = periodic_lowpass(modal_body([m for m in MODES if m[0] >= HEAVY_HZ]), TILT_HZ)
    click = periodic_lowpass(click_body(), CLICK_HZ)
    light = light + click * CLICK_WEIGHT * rms(light) / rms(click)

    spinup = SPINUP_FLOOR + (1 - SPINUP_FLOOR) * (1 - np.exp(-t / (SPINUP_MS / 1000.0)))
    signal = tile(light, frames) + tile(heavy, frames) * spinup
    signal *= 1 - np.exp(-t / (ATTACK_MS / 1000.0))

    fade_in = int(SR * FADE_IN_MS / 1000)
    fade_out = int(SR * FADE_OUT_MS / 1000)
    signal[:fade_in] *= np.linspace(0, 1, fade_in)
    signal[-fade_out:] *= np.linspace(1, 0, fade_out)

    target = 10 ** (TARGET_DBA / 20)
    return signal * (target / a_weighted_rms(signal[int(STEADY_FROM * SR):]))


def write_wav(path, signal):
    data = (np.clip(signal, -1, 1) * 32767).astype('<i2').tobytes()
    header = (b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt '
              + struct.pack('<IHHIIHH', 16, 1, 1, SR, SR * 2, 2, 16)
              + b'data' + struct.pack('<I', len(data)))
    with open(path, 'wb') as handle:
        handle.write(header + data)


def encode(wav):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav,
                    '-c:a', 'libvorbis', '-q:a', '5', '-ac', '1', '-ar', str(SR),
                    os.path.join(OUT_DIR, 'audio.ogg')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav,
                    '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', str(SR),
                    '-movflags', '+faststart',
                    os.path.join(OUT_DIR, 'audio.m4a')], check=True)


if __name__ == '__main__':
    signal = build()
    steady = signal[int(0.45 * SR):int(0.62 * SR)]
    drift = np.abs(steady[:-PERIOD] - steady[PERIOD:]).max()

    wav = os.path.join(OUT_DIR, 'audio.wav')
    write_wav(wav, signal)
    encode(wav)
    os.remove(wav)

    print(f'{DURATION} s, period {PERIOD} samples at {SR} Hz')
    sustained = signal[int(STEADY_FROM * SR):]
    print(f'peak {20 * np.log10(np.abs(signal).max()):.2f} dBFS, '
          f'sustained {20 * np.log10(rms(sustained)):.2f} dBFS / '
          f'{20 * np.log10(a_weighted_rms(sustained)):.2f} dBA')
    print(f'period-to-period error in the sustained tail: {drift:.2e}')
    for name in ('audio.ogg', 'audio.m4a'):
        path = os.path.join(OUT_DIR, name)
        print(f'  {name}  {os.path.getsize(path)} bytes')
