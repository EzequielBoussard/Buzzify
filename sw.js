// El sitio entero pesa poco mas de 100 KB, asi que se guarda completo la
// primera vez y despues funciona sin red. Un pulsador que deja de andar
// porque el wifi del salon se cayo no sirve de nada.
//
// Se sirve desde la cache y se revalida de fondo: la pagina abre al instante
// y una version nueva queda lista para la visita siguiente. La alternativa
// era pedir cache fresca en cada deploy, y eso se olvida.

const VERSION = 'v1';
const CACHE = `buzzify-${VERSION}`;

// Todo lo que hace falta para que el buzzer suene sin red. Los iconos grandes
// y la imagen para redes no entran: los pide el sistema al instalar, estando
// online, y offline no los mira nadie.
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
    // primero, y offline ese plan B tambien tiene que estar guardado.
    '/assets/audio/audio.ogg',
    '/assets/audio/audio.m4a',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL)),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
            ))
            .then(() => self.clients.claim()),
    );
});

const refresh = async (request) => {
    try {
        const response = await fetch(request);

        // Las respuestas de otro origen llegan opacas y no se pueden inspeccionar;
        // guardarlas seria guardar un error a ciegas. Y las que traen query no
        // se guardan nunca: cada link con ?utm_source distinto dejaria su propia
        // copia de la portada hasta llenar la cuota.
        const guardable = response.ok
            && response.type === 'basic'
            && !new URL(request.url).search;

        if (guardable) {
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

    // Un link compartido llega con ?utm_source y mil cosas mas. La portada es
    // la misma, asi que en una navegacion la query no cuenta para buscarla.
    const cached = await caches.match(request, {
        ignoreSearch: request.mode === 'navigate',
    });

    if (cached) {
        // Sin await: la pagina no espera por la actualizacion, pero el worker
        // no se puede apagar hasta que termine de escribirla.
        event.waitUntil(refresh(request));
        return cached;
    }

    const fresh = await refresh(request);
    if (fresh) return fresh;

    // Sin red y sin copia. Una navegacion se merece una pagina; el resto que
    // falle, que para eso audio.js y los demas ya manejan sus errores.
    if (request.mode === 'navigate') {
        const page = await caches.match('/404.html');
        // La copia guardada es un 200. Devolverla tal cual diria que la ruta
        // existe, que es justo lo contrario de lo que la pagina cuenta.
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

    // Solo lecturas de este sitio por http(s). Un POST, una extension del
    // navegador o un blob: no tienen nada que hacer aca.
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;
    if (!url.protocol.startsWith('http')) return;

    // Safari pide medios por tramos. Una respuesta guardada es entera y
    // responder 200 a un Range rompe la reproduccion, asi que va derecho.
    if (request.headers.has('range')) return;

    event.respondWith(serve(event));
});
