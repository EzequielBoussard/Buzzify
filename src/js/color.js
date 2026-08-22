import { onLangChange, t } from './i18n.js';

const STORAGE_KEY = 'buttonColor';
const DEFAULT_COLOR = '#e84c3d';
const LEGACY_DEFAULT = '#c0392b';

const PRESETS = [
    ['red', '#e84c3d'],
    ['orange', '#e67e22'],
    ['amber', '#f1c40f'],
    ['green', '#2ecc71'],
    ['teal', '#1abc9c'],
    ['blue', '#3498db'],
    ['purple', '#9b59b6'],
    ['pink', '#e84393'],
];

const root = document.documentElement;

const readStored = () => {
    let stored = null;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (!stored || stored.toLowerCase() === LEGACY_DEFAULT) return DEFAULT_COLOR;
    return stored.toLowerCase();
};

export const initColorPicker = ({ trigger, panel, presets, input }) => {
    let current = readStored();

    const swatches = PRESETS.map(([id, value]) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.dataset.id = id;
        swatch.dataset.value = value;
        swatch.style.setProperty('--swatch', value);
        swatch.setAttribute('role', 'radio');
        swatch.addEventListener('click', () => apply(value));
        presets.append(swatch);
        return swatch;
    });

    const render = () => {
        root.style.setProperty('--color-primary', current);
        input.value = current;
        swatches.forEach((swatch) => {
            swatch.setAttribute('aria-checked', String(swatch.dataset.value === current));
        });
    };

    function apply(value) {
        current = value.toLowerCase();
        try {
            localStorage.setItem(STORAGE_KEY, current);
        } catch {}
        render();
    }

    const setOpen = (open) => {
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
    };

    trigger.addEventListener('click', () => setOpen(panel.hidden));
    input.addEventListener('input', (event) => apply(event.target.value));

    document.addEventListener('pointerdown', (event) => {
        if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || panel.hidden) return;
        setOpen(false);
        trigger.focus();
    });

    onLangChange(() => {
        const names = t('colors');
        swatches.forEach((swatch) => swatch.setAttribute('aria-label', names[swatch.dataset.id]));
    });

    render();
};
