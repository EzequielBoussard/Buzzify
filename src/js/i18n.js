import { saveSetting } from './storage.js';

const STORAGE_KEY = 'lang';
const DEFAULT_LANG = 'en';

const strings = {
    es: {
        buzzer: 'Responder',
        lang: 'Idioma',
        themeLight: 'Cambiar a tema claro',
        themeDark: 'Cambiar a tema oscuro',
        hapticsOn: 'Activar vibración',
        hapticsOff: 'Desactivar vibración',
        hex: 'Color en hexadecimal',
        hue: 'Tono',
        saturation: 'Saturación',
        lightness: 'Luminosidad',
        colors: {
            red: 'Rojo',
            orange: 'Naranja',
            amber: 'Ámbar',
            green: 'Verde',
            teal: 'Turquesa',
            blue: 'Azul',
            purple: 'Violeta',
            pink: 'Rosa',
        },
    },
    en: {
        buzzer: 'Buzz in',
        lang: 'Language',
        themeLight: 'Switch to light theme',
        themeDark: 'Switch to dark theme',
        hapticsOn: 'Turn vibration on',
        hapticsOff: 'Turn vibration off',
        hex: 'Hex colour',
        hue: 'Hue',
        saturation: 'Saturation',
        lightness: 'Lightness',
        colors: {
            red: 'Red',
            orange: 'Orange',
            amber: 'Amber',
            green: 'Green',
            teal: 'Teal',
            blue: 'Blue',
            purple: 'Purple',
            pink: 'Pink',
        },
    },
};

const listeners = new Set();
let current = strings[document.documentElement.lang] ? document.documentElement.lang : DEFAULT_LANG;

export const t = (key) => strings[current][key];

export const onLangChange = (callback) => {
    listeners.add(callback);
    callback(current);
};

export const setLang = (lang) => {
    if (!strings[lang]) return;
    current = lang;
    document.documentElement.lang = lang;
    saveSetting(STORAGE_KEY, lang);
    listeners.forEach((callback) => callback(lang));
};
