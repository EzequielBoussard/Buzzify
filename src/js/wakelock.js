let sentinel = null;
let pending = false;

const acquire = async () => {
    if (!('wakeLock' in navigator) || sentinel || pending) return;
    if (document.visibilityState !== 'visible') return;

    pending = true;
    try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
            sentinel = null;
        });
    } catch {
        sentinel = null;
    } finally {
        pending = false;
    }
};

export const initWakeLock = () => {
    if (!('wakeLock' in navigator)) return;

    acquire();
    document.addEventListener('visibilitychange', acquire);
    window.addEventListener('pointerdown', acquire, { capture: true, once: true });
};
