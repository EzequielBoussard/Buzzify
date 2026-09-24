// El sitio pesa 117 KB, asi que se guarda entero y despues anda sin red. Se
// sirve desde la cache y se revalida de fondo; la otra opcion era invalidar
// en cada deploy, y eso se olvida.

const VERSION = 'v1';
const CACHE = `buzzify-${VERSION}`;

// Los iconos grandes y la imagen para redes no entran: los pide el sistema al
// instalar, estando online.
const SHELL = [
    '/',
    '/index.html',
    '/404.html',
    '/site.webmanifest',
    '/src/css/style.css',
    '/src/js/main.js',
    '/src/js/audio.js',
    '/src/js/buzzer.js',
    '/src/js/color.js',
    '/src/js/haptics.js',
    '/src/js/i18n.js',
    '/src/js/intro.js',
    '/src/js/loop.js',
    '/src/js/offline.js',
    '/src/js/platform.js',
    '/src/js/storage.js',
    '/src/js/theme.js',
    '/src/js/wakelock.js',
    '/assets/fonts/outfit-latin.woff2',
    '/assets/icons/favicon.svg',
    // Los dos formatos: audio.js cae al otro si el navegador no decodifica el
    // primero, y sin red ese plan B tambien tiene que estar guardado.
    '/assets/audio/audio.ogg',
    '/assets/audio/audio.m4a',
];

const inShell = (url) => !url.search && SHELL.includes(url.pathname);

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL)),
    );
});

// Purga las caches viejas y, dentro de la actual, lo que ya no figura en
// SHELL: sacar un archivo de la lista se arregla solo.
const prune = async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));

    const cache = await caches.open(CACHE);
    const stored = await cache.keys();
    await Promise.all(
        stored.filter((request) => !inShell(new URL(request.url)))
            .map((request) => cache.delete(request)),
    );
};

self.addEventListener('activate', (event) => {
    event.waitUntil(prune().then(() => self.clients.claim()));
});

const refresh = async (request) => {
    try {
        const response = await fetch(request);

        // Acotar a SHELL deja fuera /?utm_source=algo, que si no dejaria una
        // copia de la portada por cada link compartido.
        if (response.ok && inShell(new URL(request.url))) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
        }
        return response;
    } catch {
        return null;
    }
};

const serve = async (event) => {
    const { request } = event;

    // /?utm_source=algo es la misma portada, asi que en una navegacion la
    // query no cuenta para buscarla.
    const cached = await caches.match(request, {
        ignoreSearch: request.mode === 'navigate',
    });

    if (cached) {
        // Sin await, pero dentro de waitUntil: la pagina no espera y el worker
        // no se apaga a mitad de la escritura.
        event.waitUntil(refresh(request));
        return cached;
    }

    const fresh = await refresh(request);
    if (fresh) return fresh;

    if (request.mode === 'navigate') {
        const page = await caches.match('/404.html');
        // La copia guardada es un 200; devolverla tal cual diria que la ruta
        // existe.
        if (page) {
            return new Response(await page.blob(), {
                status: 404,
                statusText: 'Not Found',
                headers: page.headers,
            });
        }
    }

    return new Response('', { status: 504, statusText: 'Offline' });
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;
    if (!url.protocol.startsWith('http')) return;

    // Safari pide medios por tramos, y responder un 200 entero a un Range
    // rompe la reproduccion.
    if (request.headers.has('range')) return;

    event.respondWith(serve(event));
});
