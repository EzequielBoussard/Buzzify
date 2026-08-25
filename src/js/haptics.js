import { onLangChange, t } from './i18n.js';

const STORAGE_KEY = 'haptics';
const PULSE_MS = 50;

const supported = typeof navigator.vibrate === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
let enabled = true;

const read = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
        return true;
    }
};

export const pulse = () => {
    if (supported && enabled) navigator.vibrate(PULSE_MS);
};

export const initHaptics = (toggle) => {
    if (!toggle || !supported) return;

    enabled = read();
    toggle.hidden = false;

    const render = () => {
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.setAttribute('aria-label', t(enabled ? 'hapticsOff' : 'hapticsOn'));
    };

    toggle.addEventListener('click', () => {
        enabled = !enabled;
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
        } catch {}
        render();
        pulse();
    });

    onLangChange(render);
};
