// Lo que sw.js guarda para andar sin red. Agregar un archivo a src/ y no
// ponerlo en SHELL rompe la pagina sin conexion, y el peso del shell aparece
// escrito en tres lugares que quedan viejos con cualquier cambio.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fileOf = (entry) => (entry === '/' ? 'index.html' : entry.slice(1));

const shell = [...read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'(\/[^']*)'/g)]
    .map(([, entry]) => entry);

const filesUnder = (dir) => readdirSync(new URL(dir, root)).flatMap((name) => {
    const path = join(dir, name).replaceAll('\\', '/');
    return statSync(new URL(path, root)).isDirectory() ? filesUnder(path) : [path];
});

test('todo lo que esta en SHELL existe', () => {
    for (const entry of shell) {
        assert.doesNotThrow(() => statSync(new URL(fileOf(entry), root)), entry);
    }
});

test('todo src/ esta en SHELL', () => {
    for (const path of filesUnder('src')) {
        assert.ok(shell.includes(`/${path}`), `${path} no esta en SHELL`);
    }
});

test('el peso del shell que dicen el README y los comentarios es el real', () => {
    // '/' y '/index.html' son dos entradas de cache, asi que el HTML cuenta dos veces.
    const bytes = shell.reduce((sum, entry) => sum + statSync(new URL(fileOf(entry), root)).size, 0);
    const kb = Math.round(bytes / 1024);

    const mentions = [
        ['README.md', /El sitio entero pesa (\d+) KB/],
        ['sw.js', /El sitio pesa (\d+) KB/],
        ['src/js/offline.js', /guardar (\d+) KB/],
    ];
    for (const [path, pattern] of mentions) {
        const found = read(path).match(pattern);
        assert.ok(found, `${path} ya no menciona el peso`);
        assert.equal(Number(found[1]), kb, `${path} dice ${found[1]} KB y son ${kb} (${bytes} bytes)`);
    }
});
