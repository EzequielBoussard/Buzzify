# Buzzify

Pulsador de concurso para el navegador. Mantené presionado el botón y suena el buzzer, de forma continua y sin cortes, hasta que lo soltás.

Sin dependencias, sin build, sin backend: HTML, CSS y módulos ES nativos.

## Qué hace

- **Sonido continuo mientras se mantiene presionado.** El audio se repite en bucle sin costura audible (ver [El bucle](#el-bucle)).
- **Tema claro y oscuro**, con una transición circular que se expande desde el propio botón de tema.
- **Color del botón configurable**: ocho presets y un selector propio de tono, saturación y luminosidad.
- **Español e inglés.**
- **Funciona con teclado**: `Espacio` o `Enter` mantienen el buzzer sonando mientras la tecla esté pulsada.
- Las preferencias se guardan en `localStorage` y se aplican antes del primer pintado, sin parpadeo.
- **Capa de entrada** que explica el gesto y se disipa con el primer toque. No es decorativa: las políticas de autoplay solo habilitan el audio tras una activación del usuario, y en táctil esa activación llega al cerrarse el gesto, no al apoyar el dedo. Sin ese primer toque en cualquier parte, la primera pulsación sostenida del buzzer se quedaría muda.

Por defecto arranca en inglés, tema claro y verde `#2ecc71`.

## Uso local

Los módulos ES y `fetch` necesitan un servidor; abrir el archivo con `file://` no alcanza.

```bash
python -m http.server 8777
```

Después, `http://localhost:8777`.

## Estructura

```
index.html                 marcado y arranque de preferencias antes del primer pintado
site.webmanifest           metadatos de PWA
_headers                   cabeceras de caché y seguridad para Cloudflare Pages
assets/audio/              audio.ogg y audio.m4a (respaldo para WebKit)
assets/icons/              favicons, apple-touch-icon e iconos del manifest
src/css/style.css
src/js/main.js             cablea los módulos con el DOM
src/js/buzzer.js           puntero y teclado sobre el botón
src/js/audio.js            reproducción con Web Audio
src/js/loop.js             construye el bucle sin costura
src/js/intro.js            capa de entrada que habilita el audio
src/js/theme.js            claro/oscuro y la transición circular
src/js/color.js            presets y selector HSL
src/js/i18n.js             textos de accesibilidad y cambio de idioma
```

El texto visible está duplicado en el HTML con atributos `data-t` y se conmuta por CSS según `html[lang]`. JavaScript solo se ocupa de los `aria-label`, que no se pueden expresar en el marcado por duplicado.

## El bucle

Reproducir el archivo con `loop = true` produce un golpe audible en cada vuelta, por dos motivos que se resuelven por separado.

El primero es que el archivo está grabado como disparo único: abre y cierra con una rampa de unos 9 ms. Repetirlo reproduce ese hueco una y otra vez.

El segundo es que **no es un tono estacionario**: su banda grave crece alrededor de un 60 % durante los primeros 300 ms, mientras la banda aguda se mantiene plana. Cualquier bucle que incluya ese tramo reinicia el bajo más abajo de donde terminó, y eso se escucha como un bombo periódico.

`loop.js` recorta el bucle del tramo donde la banda grave ya se estabilizó, busca el largo que mejor correlaciona con el arranque —sin asumir periodicidad— y funde la cola sobre la cabeza con un crossfade lineal de 15 ms. El resultado es un buffer de unos 200 ms cuya unión es estadísticamente indistinguible del resto del sonido.

Se reproduce con `AudioBufferSourceNode` y `loop = true`, que repite el buffer con exactitud de muestra.

## Compatibilidad

El audio se sirve en Ogg Vorbis, con una copia en AAC que se elige automáticamente cuando el navegador no puede decodificar Vorbis, que es el caso de WebKit.

La transición de tema usa la View Transitions API y se degrada a un fundido CSS donde no está disponible. `color-mix()` tiene un color de reserva declarado antes.

En iOS, el contexto de audio se desbloquea reproduciendo un buffer silencioso dentro del primer gesto del usuario. Aun así, el interruptor de silencio del dispositivo silencia el Web Audio.

## Despliegue

Sin paso de compilación. En Cloudflare Pages: preset de framework **None**, comando de build vacío, directorio de salida la raíz del repositorio.

`_headers` fija revalidación en el HTML y en `src/`, y caché larga en audio e iconos. Es necesario porque los archivos no llevan hash en el nombre: sin eso, una caché larga dejaría a los visitantes con la versión anterior después de cada despliegue.

## Licencia

GPL-3.0. Ver [LICENSE](LICENSE).

Hecho por [Ezequiel Boussard](https://ezequiel.is-a.dev).
