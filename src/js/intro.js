const DISMISS_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
const FADE_TIMEOUT = 600;

export const initIntro = (intro) => {
    if (!intro) return;

    const dismiss = () => {
        DISMISS_EVENTS.forEach((type) => window.removeEventListener(type, dismiss, true));
        intro.classList.add('is-gone');
        intro.addEventListener('transitionend', () => intro.remove(), { once: true });
        setTimeout(() => intro.remove(), FADE_TIMEOUT);
    };

    DISMISS_EVENTS.forEach((type) => window.addEventListener(type, dismiss, true));
};
