import { onLangChange, t } from './i18n.js';
import { readSetting, saveSetting } from './storage.js';

const STORAGE_KEY = 'haptics';
const PULSE_MS = 50;

const isHandheld = () => window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(any-pointer: fine)').matches;

const supported = typeof navigator.vibrate === 'function' && isHandheld();
let enabled = true;

const read = () => readSetting(STORAGE_KEY) !== 'off';

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
        saveSetting(STORAGE_KEY, enabled ? 'on' : 'off');
        render();
        pulse();
    });

    onLangChange(render);
};
