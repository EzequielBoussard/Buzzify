import { onLangChange, t } from './i18n.js';

const STORAGE_KEY = 'theme';
const META_COLORS = { dark: '#14161a', light: '#f4f4f4' };
const SWEEP_DURATION = 380;
const SWEEP_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

const root = document.documentElement;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let currentTheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
let running = null;

const sweep = (origin, commit) => {
    if (!document.startViewTransition || prefersReducedMotion()) {
        commit();
        return;
    }

    running?.skipTransition();

    root.classList.add('is-theme-sweeping');
    const transition = document.startViewTransition(commit);
    running = transition;

    transition.ready
        .then(() => {
            const { x, y } = origin;
            const radius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y),
            );

            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: SWEEP_DURATION, easing: SWEEP_EASING, pseudoElement: '::view-transition-new(root)' },
            );
        })
        .catch(() => {});

    transition.finished.catch(() => {}).then(() => {
        if (running === transition) {
            running = null;
            root.classList.remove('is-theme-sweeping');
        }
    });
};

export const initTheme = (toggle, metaTheme) => {
    const label = () => toggle.setAttribute('aria-label', t(currentTheme === 'dark' ? 'themeLight' : 'themeDark'));

    const apply = (theme) => {
        root.dataset.theme = theme;
        metaTheme?.setAttribute('content', META_COLORS[theme]);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {}
        label();
    };

    toggle.addEventListener('click', () => {
        const box = toggle.getBoundingClientRect();
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        const next = currentTheme;
        label();
        sweep({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, () => apply(next));
    });

    onLangChange(label);
};
