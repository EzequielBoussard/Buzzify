// El mismo zumbido que genera tools/buzzer.py, en JavaScript y a cualquier
// sample rate, para que los tests no dependan de numpy ni de un decoder. Si
// cambia el modelo en tools/buzzer.py, hay que cambiarlo aca tambien.
//
// Falta el nivel ponderado A del final: loop.js trabaja con proporciones, asi
// que alcanza con normalizar el pico.

const MAINS = 60;
const STRIKE_FORCE = [1.00, 0.85];

// frecuencia Hz, caida ms, peso, fuerza por golpe
const MODES = [
    [125, 34, 0.70, [1.00, 1.00]],
    [358, 24, 0.69, [1.00, 0.96]],
    [486, 17, 0.52, [1.00, 0.90]],
    [838, 13, 0.95, [1.00, 0.78]],
    [1618, 9, 3.94, [1.00, 0.92]],
    [3180, 5, 2.14, [1.00, 0.92]],
];

const CLICK_WEIGHT = 0.45;
const CLICK_WIDTH_MS = 0.75;
const CLICK_HZ = 1200;
const HEAVY_HZ = 300;
const TILT_HZ = 2400;
const RING_PERIODS = 24;
const WARMUP_PERIODS = 12;
const SPINUP_MS = 120;
const SPINUP_FLOOR = 0.62;
const ATTACK_MS = 8;
const FADE_IN_MS = 2;
const FADE_OUT_MS = 8;

const DURATION = 0.65;

const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

export const buzzer = (sampleRate, { duration = DURATION } = {}) => {
    const period = Math.round(sampleRate / MAINS);
    const offsets = (count) => Array.from({ length: count }, (_, i) => Math.round((i * period) / count));

    const modalBody = (modes) => {
        const span = period * RING_PERIODS;
        const total = new Float64Array(span);
        for (const [freq, decayMs, weight, forces] of modes) {
            offsets(forces.length).forEach((offset, strike) => {
                for (let i = 0; offset + i < span; i += 1) {
                    const t = i / sampleRate;
                    total[offset + i] += forces[strike] * weight
                        * Math.exp(-t / (decayMs / 1000)) * Math.sin(2 * Math.PI * freq * t);
                }
            });
        }
        const folded = new Float64Array(period);
        for (let i = 0; i < span; i += 1) folded[i % period] += total[i];
        return folded;
    };

    const clickBody = () => {
        const sigma = (sampleRate * CLICK_WIDTH_MS) / 1000;
        const body = new Float64Array(period);
        offsets(STRIKE_FORCE.length).forEach((offset, strike) => {
            for (let i = 0; i < period; i += 1) {
                const distance = Math.min(Math.abs(i - offset), period - Math.abs(i - offset));
                body[i] += STRIKE_FORCE[strike] * Math.exp(-0.5 * (distance / sigma) ** 2);
            }
        });
        return body;
    };

    const periodicLowpass = (body, cutoff) => {
        const decay = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
        const out = new Float64Array(period);
        let value = 0;
        for (let round = 0; round < WARMUP_PERIODS; round += 1) {
            for (let i = 0; i < period; i += 1) {
                value = (1 - decay) * body[i] + decay * value;
                out[i] = value;
            }
        }
        return out;
    };

    const heavy = periodicLowpass(modalBody(MODES.filter(([freq]) => freq < HEAVY_HZ)), TILT_HZ);
    const light = periodicLowpass(modalBody(MODES.filter(([freq]) => freq >= HEAVY_HZ)), TILT_HZ);
    const click = periodicLowpass(clickBody(), CLICK_HZ);
    const clickGain = (CLICK_WEIGHT * rms(light)) / rms(click);
    for (let i = 0; i < period; i += 1) light[i] += click[i] * clickGain;

    const frames = Math.floor(sampleRate * duration);
    const fadeIn = Math.floor((sampleRate * FADE_IN_MS) / 1000);
    const fadeOut = Math.floor((sampleRate * FADE_OUT_MS) / 1000);
    const signal = new Float64Array(frames);
    let peak = 0;

    for (let i = 0; i < frames; i += 1) {
        const t = i / sampleRate;
        const spinup = SPINUP_FLOOR + (1 - SPINUP_FLOOR) * (1 - Math.exp(-t / (SPINUP_MS / 1000)));
        let value = (light[i % period] + heavy[i % period] * spinup) * (1 - Math.exp(-t / (ATTACK_MS / 1000)));
        if (i < fadeIn) value *= i / (fadeIn - 1);
        if (i >= frames - fadeOut) value *= (frames - 1 - i) / (fadeOut - 1);
        signal[i] = value;
        peak = Math.max(peak, Math.abs(value));
    }

    return Float32Array.from(signal, (value) => (value * 0.5) / peak);
};
