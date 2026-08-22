import { buildSeamlessLoop } from './loop.js';

const OGG_URL = new URL('../../assets/audio/audio.ogg', import.meta.url);
const AAC_URL = new URL('../../assets/audio/audio.m4a', import.meta.url);
const RELEASE_FADE = 0.02;
const OUTPUT_GAIN = 4;

const SOURCE_URL = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')
    ? OGG_URL
    : AAC_URL;

const sourceBytes = fetch(SOURCE_URL).then((response) => {
    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
    return response.arrayBuffer();
});

sourceBytes.catch(() => {});

let context = null;
let unlocked = false;
let decoding = null;
let ready = null;
let active = null;
let fallback = null;
let playToken = 0;

const getContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    context ??= new Context();
    return context;
};

const unlock = (ctx) => {
    if (unlocked) return;
    unlocked = true;
    const primer = ctx.createBufferSource();
    primer.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    primer.connect(ctx.destination);
    primer.start();
};

const decode = (ctx) => {
    decoding ??= sourceBytes
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .then((buffer) => {
            ready = buildSeamlessLoop(ctx, buffer);
            return ready;
        });
    return decoding;
};

const getFallback = () => {
    if (!fallback) {
        fallback = new Audio(SOURCE_URL);
        fallback.loop = true;
        fallback.preload = 'auto';
    }
    return fallback;
};

const playFallback = () => getFallback().play().catch(() => {});

const teardown = ({ source, gain }) => {
    const stopAt = context.currentTime + RELEASE_FADE;
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, stopAt);
    source.stop(stopAt);
};

const play = (ctx, buffer) => {
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
};

export const primeBuzzer = () => {
    const ctx = getContext();
    if (!ctx) return;
    unlock(ctx);
    decode(ctx).catch(() => {});
};

export const startBuzzer = () => {
    const token = ++playToken;
    const ctx = getContext();

    if (!ctx) {
        playFallback();
        return;
    }

    unlock(ctx);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    if (ready) {
        play(ctx, ready);
        return;
    }

    decode(ctx)
        .then((buffer) => {
            if (token === playToken) play(ctx, buffer);
        })
        .catch(() => {
            if (token === playToken) playFallback();
        });
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
