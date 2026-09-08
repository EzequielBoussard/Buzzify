"""Generate the buzzer asset in assets/audio/.

The sound is synthesised, not recorded. A mains buzzer is a reed pulled by a
coil energised twice per mains cycle; each pull is a strike, made of a soft
contact click plus a set of ringing mechanical modes. Consecutive strikes are
not identical, so the bright content carries sidebands at the mains rate while
the heavy modes repeat at twice it. That asymmetry is what makes a buzzer sound
like a buzzer instead of a tone.

One period is built with wrap-around, so the sustained section is exactly
periodic at 735 samples and repeats without a seam by construction. The reed
still spins up: the heavy modes need longer to reach full excursion than the
light ones, which is why the first 300 ms are not loopable and src/js/loop.js
has to look for the plateau.

    uv run --with numpy python tools/buzzer.py

Needs numpy, and ffmpeg on PATH for the Ogg and AAC encodes.
"""

import os
import struct
import subprocess
import numpy as np

SR = 44100
MAINS = 60.0
PERIOD = int(round(SR / MAINS))     # 735 samples, exact
STRIKE_FORCE = (1.00, 0.85)         # the two strikes per mains cycle

# frequency Hz, decay ms, weight, force per strike
MODES = [
    (125.0, 34.0, 1.15, (1.00, 1.00)),
    (358.0, 24.0, 0.69, (1.00, 0.96)),
    (486.0, 17.0, 0.52, (1.00, 0.90)),
    (838.0, 13.0, 0.95, (1.00, 0.78)),
    (1618.0, 9.0, 3.94, (1.00, 0.52)),
    (3180.0, 5.0, 2.14, (1.00, 0.45)),
]
CLICK_WEIGHT = 0.45
CLICK_WIDTH_MS = 0.35   # the contact is soft, not a spike
CLICK_HZ = 1200.0
HEAVY_HZ = 300.0        # modes below this are the ones that take time to build
TILT_HZ = 3400.0
RING_PERIODS = 24
WARMUP_PERIODS = 12
DURATION = 0.65
SPINUP_MS = 120.0
SPINUP_FLOOR = 0.62     # how much of the heavy modes is already there at t=0
ATTACK_MS = 8.0
FADE_IN_MS = 2.0
FADE_OUT_MS = 8.0

STEADY_FROM = 0.35
TARGET_RMS = 0.1541     # -16.24 dBFS in the sustained part; audio.js adds no gain

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'audio')


def strike_offsets(count):
    return [int(round(i * PERIOD / count)) for i in range(count)]


def modal_body(modes):
    """One exactly-periodic period, folding each mode's ring back onto itself.

    A mode rings for longer than one period, so the steady state of a sustained
    buzzer is the sum of every past strike still ringing. Folding the tail back
    into a single period reproduces that steady state exactly.
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
    """The contact click, one soft pulse per strike.

    It fills in the harmonics the narrow modes cannot reach on their own. A bare
    impulse would do that too, but it also lands as a sample-wide spike: all the
    crest factor, plus an ultrasonic tail the real thing does not have.
    """
    sigma = SR * CLICK_WIDTH_MS / 1000.0
    index = np.arange(PERIOD)
    period = np.zeros(PERIOD)
    for offset, force in zip(strike_offsets(len(STRIKE_FORCE)), STRIKE_FORCE):
        distance = np.minimum(np.abs(index - offset), PERIOD - np.abs(index - offset))
        period += force * np.exp(-0.5 * (distance / sigma) ** 2)
    return period


def periodic_lowpass(period, cutoff):
    """One-pole lowpass that leaves the period periodic.

    Filtering a single period on its own leaves the filter state discontinuous
    at the wrap, which would put a step exactly at the loop point. Running the
    filter over repeats of the period and keeping the last one lets the state
    settle first.
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

    return signal * (TARGET_RMS / rms(signal[int(STEADY_FROM * SR):]))


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
    print(f'peak {20 * np.log10(np.abs(signal).max()):.2f} dBFS, '
          f'sustained rms {20 * np.log10(rms(signal[int(STEADY_FROM * SR):])):.2f} dBFS')
    print(f'period-to-period error in the sustained tail: {drift:.2e}')
    for name in ('audio.ogg', 'audio.m4a'):
        path = os.path.join(OUT_DIR, name)
        print(f'  {name}  {os.path.getsize(path)} bytes')
