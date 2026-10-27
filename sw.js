// El sitio pesa 117 KB, asi que se guarda entero y despues anda sin red. Con
// red, cada pedido va primero a la red y la copia se pone al dia; la copia
// sale sin red o si la red no contesta a tiempo. Servir la copia primero abria
// al instante, pero mostraba la version anterior en la primera visita despues
// de cada deploy.

const VERSION = 'v1';
const CACHE = `buzzify-${VERSION}`;
const NETWORK_TIMEOUT = 3000;

// De los iconos solo entra el favicon SVG. Los PNG y el .ico son su respaldo
// para navegadores viejos, y el resto lo pide el sistema al instalar o al
// compartir, siempre estando online.
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

// Cloudflare responde /index.html y /404.html con un 308 hacia / y /404. Una
// respuesta que llego siguiendo una redireccion no se puede devolver a una
// navegacion: entrar por /index.html daba error de red. Se guarda una copia
// sin la marca de redireccion.
const clean = async (response) => (response.redirected
    ? new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    })
    : response);

const store = async (cache, request, response) => {
    await cache.put(request, await clean(response));
};

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(SHELL.map(async (path) => {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
            await store(cache, path, response);
        }));

        // Sin esperar a que se cierren las pestanas: una app instalada que no
        // se cierra nunca seguiria con el worker viejo.
        await self.skipWaiting();
    })());
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

const refresh = async (event) => {
    const { request } = event;
    try {
        const response = await fetch(request);

        // Acotar a SHELL deja fuera /?utm_source=algo, que si no dejaria una
        // copia de la portada por cada link compartido. La copia se escribe
        // de fondo: la pagina no espera a que quede guardada.
        if (response.ok && inShell(new URL(request.url))) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => store(cache, request, copy)));
        }
        return response;
    } catch {
        return null;
    }
};

const timeout = (ms) => new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
});

const serve = async (event) => {
    const { request } = event;

    // Si gana la copia, la red sigue de fondo para dejarla al dia, y
    // waitUntil evita que el worker se apague antes.
    const network = refresh(event);
    event.waitUntil(network);

    const fresh = await Promise.race([network, timeout(NETWORK_TIMEOUT)]);
    if (fresh) return fresh;

    // /?utm_source=algo es la misma portada, asi que en una navegacion la
    // query no cuenta para buscarla.
    const cached = await caches.match(request, {
        ignoreSearch: request.mode === 'navigate',
    });
    if (cached) return cached;

    const late = await network;
    if (late) return late;

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
