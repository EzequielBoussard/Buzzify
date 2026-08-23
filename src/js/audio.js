import { buildSeamlessLoop } from './loop.js';

const OGG_URL = new URL('../../assets/audio/audio.ogg', import.meta.url);
const AAC_URL = new URL('../../assets/audio/audio.m4a', import.meta.url);
const RELEASE_FADE = 0.02;
const OUTPUT_GAIN = 4;
const ARMING_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];

const SOURCE_URL = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')
    ? OGG_URL
    : AAC_URL;

const sourceBytes = fetch(SOURCE_URL).then((response) => {
    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
    return response.arrayBuffer();
});

sourceBytes.catch(() => {});

let context = null;
let loading = null;
let ready = null;
let active = null;
let wanted = false;

const getContext = () => {
    if (context) return context;

    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;

    context = new Context();
    context.addEventListener('statechange', () => tryPlay());
    return context;
};

const load = (ctx) => {
    loading ??= sourceBytes
        .then((data) => ctx.decodeAudioData(data.slice(0)))
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

function tryPlay() {
    const ctx = context;
    if (!wanted || active || !ctx || ctx.state !== 'running') return;

    if (!ready) {
        load(ctx).then(tryPlay).catch(() => {});
        return;
    }

    const gain = ctx.createGain();
    gain.gain.value = OUTPUT_GAIN;
    gain.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = ready;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = ready.duration;
    source.connect(gain);
    source.start();

    active = { source, gain };
}

const arm = () => {
    ARMING_EVENTS.forEach((type) => window.removeEventListener(type, arm, true));

    const ctx = getContext();
    if (!ctx) return;

    wake(ctx);
    load(ctx).catch(() => {});
};

ARMING_EVENTS.forEach((type) => window.addEventListener(type, arm, true));

export const startBuzzer = () => {
    wanted = true;

    const ctx = getContext();
    if (!ctx) return;

    wake(ctx);
    tryPlay();
};

export const stopBuzzer = () => {
    wanted = false;

    if (active) {
        teardown(active);
        active = null;
    }
};
