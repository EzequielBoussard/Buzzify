import { buildSeamlessLoop } from './loop.js';

const OGG_URL = new URL('../../assets/audio/audio.ogg', import.meta.url);
const AAC_URL = new URL('../../assets/audio/audio.m4a', import.meta.url);
const RELEASE_FADE = 0.02;
const OUTPUT_GAIN = 4;

const SOURCE_URL = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')
    ? OGG_URL
    : AAC_URL;

let context = null;
let bufferPromise = null;
let active = null;
let fallback = null;
let playToken = 0;

const getContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    context ??= new Context();
    return context;
};

const loadBuffer = (ctx) => {
    bufferPromise ??= fetch(SOURCE_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
            return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((decoded) => buildSeamlessLoop(ctx, decoded));
    return bufferPromise;
};

const getFallback = () => {
    if (!fallback) {
        fallback = new Audio(SOURCE_URL);
        fallback.loop = true;
        fallback.preload = 'auto';
    }
    return fallback;
};

const teardown = ({ source, gain }) => {
    const stopAt = context.currentTime + RELEASE_FADE;
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, stopAt);
    source.stop(stopAt);
};

export const primeBuzzer = () => {
    const ctx = getContext();
    if (ctx) loadBuffer(ctx).catch(() => {});
};

export const startBuzzer = async () => {
    const token = ++playToken;
    const ctx = getContext();

    if (!ctx) {
        getFallback().play().catch(() => {});
        return;
    }

    try {
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = await loadBuffer(ctx);
        if (token !== playToken) return;

        if (active) teardown(active);

        const gain = ctx.createGain();
        gain.gain.value = OUTPUT_GAIN;
        gain.connect(ctx.destination);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = buffer.duration;
        source.connect(gain);
        source.start();

        active = { source, gain };
    } catch {
        if (token === playToken) getFallback().play().catch(() => {});
    }
};

export const stopBuzzer = () => {
    playToken += 1;

    if (active) {
        teardown(active);
        active = null;
    }

    if (fallback) {
        fallback.pause();
        fallback.currentTime = 0;
    }
};
