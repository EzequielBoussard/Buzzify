// Prueba buildSeamlessLoop con el zumbido de tools/buzzer.py a las cinco
// frecuencias de muestreo que puede elegir el navegador. Sin codec de por
// medio el bucle sale mejor que con el audio real, y los umbrales dejan margen
// sobre eso: estan para que un cambio en el algoritmo o en el sonido no
// empeore el bucle sin que nadie se entere. Lo medido en Chrome esta en el
// README.
//
//     node --test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSeamlessLoop } from '../src/js/loop.js';
import { buzzer } from './buzzer.mjs';

const MAINS = 60;
const RATES = [44100, 48000, 88200, 96000, 192000];

// Lo minimo de AudioBuffer y AudioContext que usa loop.js.
const fakeBuffer = (channels, sampleRate) => ({
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (index) => channels[index],
});

const context = {
    createBuffer: (count, length, sampleRate) => fakeBuffer(
        Array.from({ length: count }, () => new Float32Array(length)),
        sampleRate,
    ),
};

const loopOf = (input, sampleRate) => buildSeamlessLoop(context, fakeBuffer([input], sampleRate));

// Pasado el crossfade, el bucle es una copia exacta de la entrada: el inicio
// es el unico offset donde coinciden.
const findStart = (input, loop, sampleRate) => {
    const from = Math.min(Math.round(sampleRate * 0.02), Math.floor(loop.length / 8));
    for (let start = 0; start + loop.length <= input.length; start += 1) {
        let same = true;
        for (let i = from; i < from + 64 && same; i += 1) same = loop[i] === input[start + i];
        if (same) return start;
    }
    return -1;
};

const lowPass = (data, sampleRate, cutoff) => {
    const decay = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    const out = new Float32Array(data.length);
    let value = 0;
    for (let i = 0; i < data.length; i += 1) out[i] = value = (1 - decay) * data[i] + decay * value;
    value = 0;
    for (let i = data.length - 1; i >= 0; i -= 1) out[i] = value = (1 - decay) * out[i] + decay * value;
    return out;
};

const cases = RATES.map((sampleRate) => {
    const input = buzzer(sampleRate);
    const loop = loopOf(input, sampleRate);
    return { sampleRate, input, loop, data: loop.getChannelData(0) };
});

for (const { sampleRate, loop } of cases) {
    test(`a ${sampleRate} Hz el bucle dura 9 ciclos de red exactos`, () => {
        assert.equal(loop.length, (9 * sampleRate) / MAINS);
        assert.equal(loop.sampleRate, sampleRate);
        assert.equal(loop.numberOfChannels, 1);
    });
}

test('el bucle va donde el sonido ya se asento', () => {
    // La meseta arranca a los 30 ms con tolerancia de 20 %, pero ahi el grave
    // todavia sube. El bucle tiene que estar cerca del final del archivo.
    for (const { sampleRate, input, data } of cases) {
        const start = findStart(input, data, sampleRate);
        assert.ok(start >= 0, `${sampleRate} Hz: no se encontro el inicio`);
        assert.ok(start / sampleRate >= 0.4, `${sampleRate} Hz: arranca a los ${(start / sampleRate * 1000).toFixed(0)} ms`);
    }
});

test('los dos tramos que funde el crossfade casi no difieren', () => {
    // El crossfade arranca en la muestra que seguia, asi que el salto entre la
    // ultima y la primera es siempre uno que el sonido ya tiene. Lo que cuenta
    // es cuanto difiere lo que se repite de lo que hubiera seguido: sin codec
    // da -53 dB; con el audio real, -23 en ogg y -41 en aac.
    const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    for (const { sampleRate, input, data } of cases) {
        const start = findStart(input, data, sampleRate);
        const width = Math.round(sampleRate * 0.02);
        const head = input.subarray(start, start + width);
        const next = input.subarray(start + data.length, start + data.length + width);
        const mismatch = 20 * Math.log10(rms(head.map((value, i) => value - next[i])) / rms(head));
        assert.ok(mismatch < -40, `${sampleRate} Hz: difieren en ${mismatch.toFixed(1)} dB`);
    }
});

test('el grave varia menos de 1 % a lo largo del bucle', () => {
    // Un bucle metido en la subida del grave repite esa subida en cada vuelta
    // y se oye como un bombo: al principio de la meseta era un 7 %.
    for (const { sampleRate, data } of cases) {
        const period = Math.round(sampleRate / MAINS);
        const repeated = new Float32Array(data.length * 3);
        for (let round = 0; round < 3; round += 1) repeated.set(data, round * data.length);
        const low = lowPass(repeated, sampleRate, 120);

        const levels = [];
        for (let i = data.length; i + period <= data.length * 2; i += period) {
            let sum = 0;
            for (let j = i; j < i + period; j += 1) sum += low[j] * low[j];
            levels.push(Math.sqrt(sum / period));
        }
        const swing = (Math.max(...levels) - Math.min(...levels)) / Math.max(...levels);
        assert.ok(swing < 0.01, `${sampleRate} Hz: el grave varia ${(swing * 100).toFixed(2)} %`);
    }
});

test('todos los canales se cortan en el mismo lugar', () => {
    const sampleRate = 44100;
    const left = buzzer(sampleRate);
    const right = left.map((value) => value * 0.5);
    const loop = buildSeamlessLoop(context, fakeBuffer([left, right], sampleRate));

    assert.equal(loop.numberOfChannels, 2);
    const [outLeft, outRight] = [loop.getChannelData(0), loop.getChannelData(1)];
    for (let i = 0; i < loop.length; i += 1) {
        assert.ok(Math.abs(outRight[i] - outLeft[i] * 0.5) < 1e-6, `muestra ${i}`);
    }
});

test('el mismo audio da siempre el mismo bucle', () => {
    const sampleRate = 48000;
    assert.deepEqual(loopOf(buzzer(sampleRate), sampleRate).getChannelData(0), cases[1].data);
});

test('sin tramo suficiente devuelve el audio original', () => {
    const sampleRate = 48000;
    const silent = fakeBuffer([new Float32Array(sampleRate)], sampleRate);
    assert.equal(buildSeamlessLoop(context, silent), silent);

    const short = fakeBuffer([buzzer(sampleRate, { duration: 0.2 })], sampleRate);
    assert.equal(buildSeamlessLoop(context, short), short);
});
