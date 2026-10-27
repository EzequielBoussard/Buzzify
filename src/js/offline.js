// Espera al load: guardar 117 KB no puede competir con el primer pintado. Si
// falla no pasa nada, la pagina anda igual pidiendole todo a la red.

export const initOffline = () => {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, { once: true });
};
