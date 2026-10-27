// Corre sw.js con una red y una cache de mentira. El worker ya tuvo dos
// problemas que solo aparecian en produccion: las copias redirigidas de
// /index.html y la version vieja en la primera visita despues de un deploy.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ORIGIN = 'https://buzzify.pages.dev';
const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const shell = [...source.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'(\/[^']*)'/g)].map(([, path]) => path);

const keyOf = (request, ignoreSearch) => {
    const url = new URL(typeof request === 'string' ? request : request.url, ORIGIN);
    if (ignoreSearch) url.search = '';
    return url.href;
};

// Lo que hace el navegador al guardar: se queda con el cuerpo y las
// cabeceras, y la marca de redireccion viaja con la respuesta.
const snapshot = async (response) => {
    const copy = new Response(await response.clone().arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
    if (response.redirected) Object.defineProperty(copy, 'redirected', { value: true });
    return copy;
};

const makeCaches = () => {
    const stores = new Map();
    const open = async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const entries = stores.get(name);
        return {
            put: async (request, response) => {
                entries.set(keyOf(request), { url: keyOf(request), response: await snapshot(response) });
            },
            match: async (request, { ignoreSearch = false } = {}) => {
                const wanted = keyOf(request, ignoreSearch);
                for (const entry of entries.values()) {
                    if (keyOf(entry.url, ignoreSearch) === wanted) return snapshot(entry.response);
                }
                return undefined;
            },
            keys: async () => [...entries.values()].map(({ url }) => ({ url })),
            delete: async (request) => entries.delete(keyOf(request)),
        };
    };
    return {
        stores,
        open,
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (request, options) => {
            for (const name of stores.keys()) {
                const found = await (await open(name)).match(request, options);
                if (found) return found;
            }
            return undefined;
        },
    };
};

// El sitio en Cloudflare: /index.html y /404.html llegan tras un 308.
const makeNetwork = () => {
    const network = { online: true, delay: 0, footer: '-', requests: 0 };
    network.fetch = async (request) => {
        network.requests += 1;
        if (network.delay) await new Promise((resolve) => setTimeout(resolve, network.delay));
        if (!network.online) throw new TypeError('Failed to fetch');

        const url = new URL(typeof request === 'string' ? request : request.url, ORIGIN);
        const path = url.pathname;
        if (path === '/404.html' || path === '/no-existe') {
            const status = path === '/404.html' ? 200 : 404;
            const response = new Response('<p>This page does not exist</p>', { status, headers: { 'Content-Type': 'text/html' } });
            if (path === '/404.html') Object.defineProperty(response, 'redirected', { value: true });
            return response;
        }
        if (path === '/' || path === '/index.html' || shell.includes(path)) {
            const body = path === '/' || path === '/index.html'
                ? `<footer>Ezequiel Boussard ${network.footer} 2025-2026</footer>`
                : `contenido de ${path}`;
            const response = new Response(body, { status: 200 });
            if (path === '/index.html') Object.defineProperty(response, 'redirected', { value: true });
            return response;
        }
        return new Response('', { status: 404 });
    };
    return network;
};

const boot = async () => {
    const listeners = {};
    const network = makeNetwork();
    const caches = makeCaches();
    const self = {
        location: { origin: ORIGIN },
        skipped: false,
        addEventListener: (type, listener) => { listeners[type] = listener; },
        skipWaiting: async () => { self.skipped = true; },
        clients: { claim: async () => {} },
    };
    // Los tiempos del worker corren cien veces mas rapido.
    const fastTimeout = (callback, ms) => setTimeout(callback, ms / 100);
    new Function('self', 'caches', 'fetch', 'setTimeout', source)(self, caches, network.fetch, fastTimeout);

    const extend = async (type) => {
        const pending = [];
        listeners[type]({ waitUntil: (promise) => pending.push(promise) });
        await Promise.all(pending);
    };

    // Un FetchEvent, mas la regla del navegador que rompio /index.html: una
    // navegacion no acepta una respuesta marcada como redirigida.
    const request = async (path, { mode = 'cors', headers = {} } = {}) => {
        let answer = null;
        const pending = [];
        listeners.fetch({
            request: { url: new URL(path, ORIGIN).href, method: 'GET', mode, headers: new Headers(headers) },
            respondWith: (promise) => { answer = promise; },
            waitUntil: (promise) => pending.push(promise),
        });
        if (!answer) return null;
        const started = performance.now();
        const response = await answer;
        response.answeredIn = performance.now() - started;
        await Promise.all(pending);
        if (mode === 'navigate' && response.redirected) throw new TypeError('redirected response for a navigation');
        return response;
    };

    await extend('install');
    await extend('activate');
    return { self, network, caches, request };
};

test('al instalarse guarda todo SHELL y toma el control sin esperar', async () => {
    const { self, caches } = await boot();
    const stored = await (await caches.open('buzzify-v1')).keys();
    assert.equal(stored.length, shell.length);
    assert.ok(self.skipped);
});

test('las copias de /index.html y /404.html no quedan redirigidas', async () => {
    const { network, request } = await boot();
    network.online = false;
    for (const path of ['/index.html', '/404.html']) {
        const response = await request(path, { mode: 'navigate' });
        assert.equal(response.status, 200, path);
    }
});

test('con red sirve la version nueva aunque haya una copia vieja', async () => {
    const { network, request } = await boot();
    network.footer = '\u2014';
    await request('/', { mode: 'navigate' });

    network.footer = '-';
    const page = await (await request('/', { mode: 'navigate' })).text();
    assert.match(page, /Boussard - 2025/);
});

test('sin red sirve la copia, y la copia es la ultima que vio', async () => {
    const { network, request } = await boot();
    network.footer = 'nuevo';
    await request('/', { mode: 'navigate' });

    network.online = false;
    const page = await (await request('/', { mode: 'navigate' })).text();
    assert.match(page, /Boussard nuevo 2025/);
    assert.equal(await (await request('/src/js/main.js')).text(), 'contenido de /src/js/main.js');
});

test('si la red no contesta a tiempo sirve la copia', async () => {
    const { network, request } = await boot();
    // Timeout de 3 s a escala: 30 ms. La red tarda 200.
    network.delay = 200;
    const response = await request('/', { mode: 'navigate' });
    assert.equal(response.status, 200);
    assert.ok(response.answeredIn >= 25, `contesto a los ${response.answeredIn.toFixed(0)} ms, antes del timeout`);
    assert.ok(response.answeredIn < 150, `espero a la red: ${response.answeredIn.toFixed(0)} ms`);
});

test('un link compartido con query abre la portada sin dejar copias de mas', async () => {
    const { network, caches, request } = await boot();
    await request('/?utm_source=whatsapp', { mode: 'navigate' });
    assert.equal((await (await caches.open('buzzify-v1')).keys()).length, shell.length);

    network.online = false;
    const page = await (await request('/?utm_source=whatsapp', { mode: 'navigate' })).text();
    assert.match(page, /Boussard/);
});

test('una ruta inexistente sin red devuelve la 404 guardada como 404', async () => {
    const { network, request } = await boot();
    network.online = false;
    const response = await request('/no-existe', { mode: 'navigate' });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /does not exist/);
});

test('los pedidos por tramos van directo a la red', async () => {
    const { request } = await boot();
    assert.equal(await request('/assets/audio/audio.m4a', { headers: { Range: 'bytes=0-1023' } }), null);
});

test('al activarse borra caches viejas y lo que ya no esta en SHELL', async () => {
    const { caches, network } = await boot();
    const old = await caches.open('buzzify-v0');
    await old.put('/', new Response('vieja'));
    const current = await caches.open('buzzify-v1');
    await current.put('/archivo-que-ya-no-existe.js', new Response(''));

    const listeners = {};
    const self = { location: { origin: ORIGIN }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
    new Function('self', 'caches', 'fetch', 'setTimeout', source)(self, caches, network.fetch, setTimeout);
    const pending = [];
    listeners.activate({ waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);

    assert.deepEqual(await caches.keys(), ['buzzify-v1']);
    assert.equal((await current.keys()).length, shell.length);
});
