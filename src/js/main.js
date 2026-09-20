import { initBuzzer } from './buzzer.js';
import { initColorPicker } from './color.js';
import { initHaptics } from './haptics.js';
import { initIntro } from './intro.js';
import { initOffline } from './offline.js';
import { initWakeLock } from './wakelock.js';
import { onLangChange, setLang, t } from './i18n.js';
import { initTheme } from './theme.js';

const buzzer = document.getElementById('buzzer');
const langToggles = document.querySelectorAll('.lang-toggle');
const langButtons = document.querySelectorAll('.lang-btn');

onLangChange((lang) => {
    buzzer.setAttribute('aria-label', t('buzzer'));
    langToggles.forEach((group) => group.setAttribute('aria-label', t('lang')));
    langButtons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    });
});

langButtons.forEach((button) => {
    button.addEventListener('click', () => setLang(button.dataset.lang));
});

initTheme(document.getElementById('themeToggle'), document.querySelector('meta[name="theme-color"]'));

initColorPicker({
    trigger: document.getElementById('colorTrigger'),
    panel: document.getElementById('colorPanel'),
    presets: document.getElementById('colorPresets'),
    custom: document.querySelector('.color-custom'),
    hue: document.getElementById('hueRange'),
    saturation: document.getElementById('satRange'),
    lightness: document.getElementById('litRange'),
    value: document.getElementById('colorValue'),
});

initBuzzer(buzzer);
initHaptics(document.getElementById('hapticsToggle'));
initIntro(document.getElementById('intro'), document.getElementById('introNote'));
initWakeLock();
initOffline();
