const DISMISS_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const FADE_TIMEOUT = 700;
const KEEP_OPEN = '.intro__langs';

export const initIntro = (intro) => {
    if (!intro) return;

    const dismiss = (event) => {
        if (event.target?.closest?.(KEEP_OPEN)) return;

        DISMISS_EVENTS.forEach((type) => window.removeEventListener(type, dismiss, true));
        intro.classList.add('is-gone');
        intro.addEventListener('transitionend', () => intro.remove(), { once: true });
        setTimeout(() => intro.remove(), FADE_TIMEOUT);
    };

    DISMISS_EVENTS.forEach((type) => window.addEventListener(type, dismiss, true));
};
