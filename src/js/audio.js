import { buildSeamlessLoop } from './loop.js';
import { isIOS } from './platform.js';

const OGG_URL = new URL('../../assets/audio/audio.ogg', import.meta.url);
const AAC_URL = new URL('../../assets/audio/audio.m4a', import.meta.url);
const RELEASE_FADE = 0.02;
const ARMING_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const SILENT_RATE = 8000;
const SILENT_FRAMES = 2000;

const canPlayOgg = Boolean(document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"'));
const [PRIMARY_URL, FALLBACK_URL] = canPlayOgg ? [OGG_URL, AAC_URL] : [AAC_URL, OGG_URL];

const fetchAudio = (url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
    return response.arrayBuffer();
});

const primaryBytes = fetchAudio(PRIMARY_URL);
primaryBytes.catch(() => {});

let context = null;
let loading = null;
let ready = null;
let active = null;
let keepAlive = null;
let wanted = false;

// Un WAV mudo armado a mano: 44 bytes de cabecera y el resto en cero. Es para
// iOS viejo, donde reproducirlo en bucle cambia la categoria de audio del
// sistema y saca el sonido del interruptor lateral de silencio.
const silentTrack = () => {
    const bytes = new ArrayBuffer(44 + SILENT_FRAMES * 2);
    const view = new DataView(bytes);
    const tag = (offset, text) => {
        for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };

    tag(0, 'RIFF');
    view.setUint32(4, 36 + SILENT_FRAMES * 2, true);
    tag(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SILENT_RATE, true);
    view.setUint32(28, SILENT_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, SILENT_FRAMES * 2, true);

    const track = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
    track.loop = true;
    track.playsInline = true;
    return track;
};

const routeToSpeaker = () => {
    if (navigator.audioSession) {
        try {
            navigator.audioSession.type = 'playback';
        } catch {}
        return;
    }

    if (!isIOS) return;

    keepAlive ??= silentTrack();
    keepAlive.play().catch(() => {});
};

const getContext = () => {
    if (context) return context;

    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;

    context = new Context();
    context.addEventListener('statechange', () => tryPlay());
    return context;
};

const load = (ctx) => {
    loading ??= primaryBytes
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .catch(() => fetchAudio(FALLBACK_URL).then((data) => ctx.decodeAudioData(data.slice(0))))
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
    gain.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = ready;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = ready.duration;
    source.connect(gain);
    source.addEventListener('ended', () => gain.disconnect(), { once: true });
    source.start();

    active = { source, gain };
}

const arm = () => {
    ARMING_EVENTS.forEach((type) => window.removeEventListener(type, arm, true));

    routeToSpeaker();

    const ctx = getContext();
    if (!ctx) return;

    wake(ctx);
    load(ctx).catch(() => {});
};

ARMING_EVENTS.forEach((type) => window.addEventListener(type, arm, true));

export const startBuzzer = () => {
    wanted = true;
    routeToSpeaker();

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
