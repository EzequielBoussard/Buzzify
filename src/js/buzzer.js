import { startBuzzer, stopBuzzer } from './audio.js';
import { pulse } from './haptics.js';

const HOLD_KEYS = new Set([' ', 'Enter']);

export const initBuzzer = (button) => {
    let held = false;

    const press = () => {
        if (held) return;
        held = true;
        button.classList.add('is-pressed');
        pulse();
        startBuzzer();
    };

    const release = () => {
        if (!held) return;
        held = false;
        button.classList.remove('is-pressed');
        stopBuzzer();
    };

    button.addEventListener('pointerdown', (event) => {
        // Clic derecho o rueda: el menu contextual puede comerse el pointerup.
        if (event.button !== 0) return;
        press();
        try {
            button.setPointerCapture(event.pointerId);
        } catch {}
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);

    button.addEventListener('keydown', (event) => {
        if (!HOLD_KEYS.has(event.key)) return;
        event.preventDefault();
        press();
    });
    button.addEventListener('keyup', (event) => {
        if (HOLD_KEYS.has(event.key)) release();
    });

    button.addEventListener('blur', release);
    window.addEventListener('blur', release);
};
