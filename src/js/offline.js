// El registro espera al load: guardar el sitio entero no puede competir con
// el primer pintado. Falla en silencio a proposito — sin service worker la
// pagina anda igual, solo que pidiendo todo a la red.

export const initOffline = () => {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, { once: true });
};
