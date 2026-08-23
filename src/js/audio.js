import { buildSeamlessLoop } from './loop.js';

const OGG_URL = new URL('../../assets/audio/audio.ogg', import.meta.url);
const AAC_URL = new URL('../../assets/audio/audio.m4a', import.meta.url);
const RELEASE_FADE = 0.02;
const OUTPUT_GAIN = 4;

const SOURCE_URL = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')
    ? OGG_URL
    : AAC_URL;

let context = null;
let loading = null;
let ready = null;
let active = null;
let playToken = 0;

const getContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    context ??= new Context();
    return context;
};

const load = () => {
    const ctx = getContext();
    if (!ctx) return Promise.reject(new Error('Web Audio unavailable'));

    loading ??= fetch(SOURCE_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
            return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
            ready = buildSeamlessLoop(ctx, buffer);
            return ready;
        });

    return loading;
};

const wake = (ctx) => {
    if (ctx.state === 'running') return;

    const primer = ctx.createBufferSource();
    primer.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    primer.connect(ctx.destination);
    primer.start();

    ctx.resume().catch(() => {});
};

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

export const startBuzzer = () => {
    const token = ++playToken;
    const ctx = getContext();
    if (!ctx) return;

    wake(ctx);

    if (ready) {
        play(ctx, ready);
        return;
    }

    load()
        .then((buffer) => {
            if (token === playToken) play(ctx, buffer);
        })
        .catch(() => {});
};

export const stopBuzzer = () => {
    playToken += 1;

    if (active) {
        teardown(active);
        active = null;
    }
};

load().catch(() => {});
