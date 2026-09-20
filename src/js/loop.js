// El archivo es un disparo unico y su banda grave sigue creciendo durante los
// primeros 300 ms. Loopear ese tramo se oye como un bombo, asi que primero se
// busca donde el grave se estabiliza y recien ahi el largo del bucle.
//
// Todo va en milisegundos y en Hz, nunca en muestras: el navegador abre el
// AudioContext al sample rate que quiere y el resultado no puede depender de
// eso.

const BLOCK_MS = 10;
const SILENCE_RATIO = 0.5;
const LOW_CUTOFF = 120;

// Cuanto puede alejarse un bloque de la referencia sin cortar la meseta. Se
// prueban en orden: si con el 12 % no queda tramo suficiente para un bucle,
// se afloja, y el 1 final acepta cualquier cosa antes que rendirse.
const PLATEAU_TOLERANCES = [0.12, 0.2, 0.35, 1];

const MATCH_WINDOW_MS = 90;

// La pasada gruesa mira una muestra de cada ocho a 44,1 kHz, y el mismo tramo
// de tiempo a cualquier otro rate. Despues se afina de a una muestra.
const COARSE_BANDWIDTH = 5512.5;

// Piso del bucle. Mas corto empieza a sonar a tono en vez de a zumbido.
const MIN_LOOP_MS = 150;
const CROSSFADE_MS = 20;

const lowPass = (data, sampleRate, cutoff) => {
    const decay = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    const gain = 1 - decay;
    const out = new Float32Array(data.length);

    let value = 0;
    for (let i = 0; i < data.length; i += 1) {
        value = gain * data[i] + decay * value;
        out[i] = value;
    }

    value = 0;
    for (let i = data.length - 1; i >= 0; i -= 1) {
        value = gain * out[i] + decay * value;
        out[i] = value;
    }
    return out;
};

const blockLevels = (data, size) => {
    const levels = [];
    for (let i = 0; i + size <= data.length; i += size) {
        let sum = 0;
        for (let j = i; j < i + size; j += 1) sum += data[j] * data[j];
        levels.push(Math.sqrt(sum / size));
    }
    return levels;
};

const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];

const findLastLoudBlock = (levels) => {
    const threshold = median(levels) * SILENCE_RATIO;
    let last = levels.length - 1;
    while (last > 0 && levels[last] < threshold) last -= 1;
    return last;
};

const findPlateauStart = (levels, lastBlock, tolerance) => {
    const tail = levels.slice(Math.floor(levels.length * 0.6), lastBlock);
    const reference = median(tail);
    if (!reference) return lastBlock;

    let first = lastBlock;
    for (let i = lastBlock - 1; i >= 0; i -= 1) {
        if (Math.abs(levels[i] - reference) / reference > tolerance) break;
        first = i;
    }
    return first;
};

const correlate = (data, a, b, width, step) => {
    let product = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < width; i += step) {
        const x = data[a + i];
        const y = data[b + i];
        product += x * y;
        energyA += x * x;
        energyB += y * y;
    }
    return product / Math.sqrt(energyA * energyB || 1);
};

const findLoopLength = (full, low, start, end, minLength, window, step) => {
    const maxLength = end - start - window;
    const score = (length, stride) =>
        correlate(full, start, start + length, window, stride)
        + correlate(low, start, start + length, window, stride);

    let coarse = minLength;
    let best = -Infinity;

    for (let length = minLength; length <= maxLength; length += step) {
        const value = score(length, step);
        if (value > best) {
            best = value;
            coarse = length;
        }
    }

    let length = coarse;
    best = -Infinity;
    for (let offset = -step * 2; offset <= step * 2; offset += 1) {
        const candidate = coarse + offset;
        if (candidate < minLength || start + candidate + window > end) continue;

        const value = score(candidate, 1);
        if (value > best) {
            best = value;
            length = candidate;
        }
    }
    return length;
};

export const buildSeamlessLoop = (context, source) => {
    const analysis = source.getChannelData(0);
    const { sampleRate } = source;

    const size = Math.round((sampleRate * BLOCK_MS) / 1000);
    const lastBlock = findLastLoudBlock(blockLevels(analysis, size));
    const low = lowPass(analysis, sampleRate, LOW_CUTOFF);
    const lowLevels = blockLevels(low, size);

    const end = lastBlock * size;
    const minLength = Math.round((sampleRate * MIN_LOOP_MS) / 1000);
    const window = Math.round((sampleRate * MATCH_WINDOW_MS) / 1000);
    const step = Math.max(1, Math.round(sampleRate / COARSE_BANDWIDTH));

    let start = -1;
    for (const tolerance of PLATEAU_TOLERANCES) {
        const candidate = findPlateauStart(lowLevels, lastBlock, tolerance) * size;
        if (end - candidate - window >= minLength) {
            start = candidate;
            break;
        }
    }
    if (start < 0) return source;

    const length = findLoopLength(analysis, low, start, end, minLength, window, step);
    const fade = Math.min(
        Math.round((sampleRate * CROSSFADE_MS) / 1000),
        Math.floor(length / 8),
        end - start - length,
    );

    const loop = context.createBuffer(source.numberOfChannels, length, sampleRate);

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
        const input = source.getChannelData(channel);
        const output = loop.getChannelData(channel);

        for (let i = 0; i < length; i += 1) output[i] = input[start + i];

        for (let i = 0; i < fade; i += 1) {
            const ratio = i / fade;
            output[i] = output[i] * ratio + input[start + length + i] * (1 - ratio);
        }
    }

    return loop;
};
