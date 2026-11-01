// Un toque en un iPhone, con la regla de Safari: resume() solo desbloquea el
// audio si se llama dentro de un gesto, y en tactil pointerdown no lo es.
// Con eso el buzzer estuvo mudo en iOS sin que ningun navegador de
// escritorio lo mostrara.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buzzer } from './buzzer.mjs';

const GESTURES = new Set(['pointerup', 'touchend', 'click', 'keydown']);
let inGesture = false;

const listeners = new Map();
globalThis.window = {
    addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
};

const tap = () => {
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click']) {
        inGesture = GESTURES.has(type);
        for (const fn of [...(listeners.get(type) ?? [])]) fn({ type });
    }
    inGesture = false;
};

const fakeBuffer = (channels, sampleRate) => ({
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData: (index) => channels[index],
});

const started = [];
class FakeContext {
    constructor() {
        this.state = 'suspended';
        this.sampleRate = 48000;
        this.currentTime = 0;
        this.destination = {};
        this.onState = [];
    }

    addEventListener(type, fn) { if (type === 'statechange') this.onState.push(fn); }

    resume() {
        if (!inGesture) return Promise.reject(new Error('NotAllowedError'));
        this.state = 'running';
        queueMicrotask(() => this.onState.forEach((fn) => fn()));
        return Promise.resolve();
    }

    createBuffer(count, length, sampleRate) {
        return fakeBuffer(Array.from({ length: count }, () => new Float32Array(length)), sampleRate);
    }

    createBufferSource() {
        const source = { connect() {}, addEventListener() {}, stop() {}, start: () => started.push(source) };
        return source;
    }

    createGain() {
        return { connect() {}, disconnect() {}, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} } };
    }

    decodeAudioData() {
        return Promise.resolve(fakeBuffer([buzzer(this.sampleRate)], this.sampleRate));
    }
}

globalThis.window.AudioContext = FakeContext;
globalThis.document = { createElement: () => ({ canPlayType: () => 'probably' }) };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
globalThis.URL.createObjectURL = () => 'blob:silencio';
globalThis.Audio = class { play() { return inGesture ? Promise.resolve() : Promise.reject(new Error('NotAllowedError')); } };
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5, audioSession: {} },
    configurable: true,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const { startBuzzer, stopBuzzer } = await import('../src/js/audio.js');

test('un toque desbloquea el audio aunque pointerdown no sea un gesto', async () => {
    tap();
    await settle();
    assert.equal(navigator.audioSession.type, 'playback');
    const armed = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']
        .reduce((sum, type) => sum + (listeners.get(type)?.size ?? 0), 0);
    assert.equal(armed, 0, 'quedaron listeners de desbloqueo con el contexto ya andando');
});

test('despues de ese toque, apretar el buzzer suena en bucle', async () => {
    started.length = 0;
    startBuzzer();
    await settle();
    const loop = started.find((source) => source.loop);
    assert.ok(loop, 'no arranco ninguna fuente en bucle');
    assert.equal(loop.buffer.length, 7200);
    stopBuzzer();
});
