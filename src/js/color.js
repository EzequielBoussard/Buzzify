import { onLangChange, t } from './i18n.js';

const STORAGE_KEY = 'buttonColor';
const DEFAULT_COLOR = '#2ecc71';
const STALE_DEFAULTS = ['#c0392b', '#e84c3d'];

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
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hexToHsl = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const span = max - min;
    const l = (max + min) / 2;

    if (!span) return { h: 0, s: 0, l: l * 100 };

    const s = span / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / span) % 6;
    else if (max === g) h = (b - r) / span + 2;
    else h = (r - g) / span + 4;

    return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
};

const hslToHex = (h, s, l) => {
    const sat = s / 100;
    const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lig - c / 2;
    const sector = Math.floor(h / 60) % 6;
    const [r, g, b] = [
        [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ][sector];

    return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
};

const readStored = () => {
    let stored = null;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (!stored || STALE_DEFAULTS.includes(stored.toLowerCase())) return DEFAULT_COLOR;
    return stored.toLowerCase();
};

export const initColorPicker = ({ trigger, panel, presets, custom, hue, saturation, lightness, value }) => {
    let current = readStored();

    const swatches = PRESETS.map(([id, hex]) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.dataset.id = id;
        swatch.dataset.value = hex;
        swatch.style.setProperty('--swatch', hex);
        swatch.setAttribute('role', 'radio');
        swatch.addEventListener('click', () => apply(hex));
        presets.append(swatch);
        return swatch;
    });

    const render = () => {
        const { h, s, l } = hexToHsl(current);
        root.style.setProperty('--color-primary', current);
        custom.style.setProperty('--hue', String(Math.round(h)));
        custom.style.setProperty('--sat', `${Math.round(s)}%`);
        custom.style.setProperty('--lit', `${Math.round(l)}%`);
        hue.value = String(Math.round(h));
        saturation.value = String(Math.round(s));
        lightness.value = String(clamp(Math.round(l), Number(lightness.min), Number(lightness.max)));
        value.textContent = current.toUpperCase();
        swatches.forEach((swatch) => {
            swatch.setAttribute('aria-checked', String(swatch.dataset.value === current));
        });
    };

    const apply = (hex) => {
        current = hex.toLowerCase();
        try {
            localStorage.setItem(STORAGE_KEY, current);
        } catch {}
        render();
    };

    const applyFromSliders = () => {
        apply(hslToHex(Number(hue.value), Number(saturation.value), Number(lightness.value)));
    };

    [hue, saturation, lightness].forEach((slider) => {
        slider.addEventListener('input', applyFromSliders);
    });

    const setOpen = (open) => {
        panel.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
    };

    trigger.addEventListener('click', () => setOpen(panel.hidden));

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
        hue.setAttribute('aria-label', t('hue'));
        saturation.setAttribute('aria-label', t('saturation'));
        lightness.setAttribute('aria-label', t('lightness'));
    });

    render();
};
