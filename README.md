# Buzzify

Pulsador de concurso para el navegador. Mantené presionado el botón y suena el buzzer, de forma continua y sin cortes, hasta que lo soltás.

Sin dependencias, sin build, sin backend: HTML, CSS y módulos ES nativos. La única tipografía va autoalojada, así que el sitio no pide nada a terceros. El audio tampoco es una grabación: se genera con un modelo físico (ver [El sonido](#el-sonido)).

## Qué hace

- **Sonido continuo mientras se mantiene presionado.** El audio se repite en bucle sin costura audible (ver [El bucle](#el-bucle)).
- **Tema claro y oscuro**, con una transición circular que se expande desde el propio botón de tema.
- **Color del botón configurable**: ocho presets y un selector propio de tono, saturación y luminosidad.
- **Español e inglés.** En la primera visita se elige según `navigator.language`; a partir de ahí manda lo que el visitante haya elegido.
- **Vibración configurable** al pulsar, solo en móviles y tablets: se exige puntero grueso y ausencia de puntero fino, así que un equipo con ratón nunca ve el interruptor. Se puede apagar desde la barra. iOS no implementa la Vibration API, así que ahí el interruptor tampoco aparece.
- **La pantalla no se apaga** mientras la página está a la vista, vía Wake Lock. Un pulsador apoyado en la mesa que se apaga solo no sirve de nada.
- **Funciona con teclado**: `Espacio` o `Enter` mantienen el buzzer sonando mientras la tecla esté pulsada, y los presets de color se recorren con las flechas, con `Inicio` y `Fin` en los extremos.
- Las preferencias se guardan en `localStorage` y se aplican antes del primer pintado, sin parpadeo.
- **Capa de entrada** con la marca, el gesto y un conmutador de idioma, que se disipa con el primer toque. No es decorativa: las políticas de autoplay solo habilitan el audio tras una activación del usuario, y en táctil esa activación llega al cerrarse el gesto, no al apoyar el dedo. Sin ese primer toque en cualquier parte, la primera pulsación sostenida del buzzer se quedaría muda.

Por defecto arranca en tema claro y verde `#2ecc71`. El idioma sale de `navigator.language`, con inglés como reserva.

## Uso local

Los módulos ES y `fetch` necesitan un servidor; abrir el archivo con `file://` no alcanza.

```bash
python -m http.server 8777
```

Después, `http://localhost:8777`.

## Estructura

```
index.html                 marcado y arranque de preferencias antes del primer pintado
404.html                   pagina de ruta inexistente, sin scripts, en los dos idiomas a la vez
site.webmanifest           metadatos de PWA
_headers                   cabeceras de caché y seguridad para Cloudflare Pages
assets/audio/              audio.ogg y audio.m4a (respaldo para WebKit)
assets/fonts/              Outfit variable, subconjunto latino, autoalojada, con su OFL
assets/og-image.png        tarjeta para redes
assets/icons/              favicons, apple-touch-icon e iconos del manifest
src/css/style.css
src/js/main.js             cablea los módulos con el DOM
src/js/buzzer.js           puntero y teclado sobre el botón
src/js/audio.js            reproducción con Web Audio
src/js/loop.js             construye el bucle sin costura
src/js/intro.js            capa de entrada que habilita el audio
src/js/haptics.js          vibración al pulsar y su interruptor
src/js/wakelock.js         mantiene la pantalla encendida
src/js/platform.js         detección de iOS, compartida por audio e intro
src/js/theme.js            claro/oscuro y la transición circular
src/js/color.js            presets y selector HSL
src/js/i18n.js             textos de accesibilidad y cambio de idioma
tools/buzzer.py            genera el audio; no interviene en el sitio
```

El texto visible está duplicado en el HTML con atributos `data-t` y se conmuta por CSS según `html[lang]`. JavaScript solo se ocupa de los `aria-label`, que no se pueden expresar en el marcado por duplicado.

## El sonido

El audio no es una grabación: lo genera [`tools/buzzer.py`](tools/buzzer.py) a partir de un modelo de zumbador electromagnético. Una lengüeta metálica es atraída por una bobina dos veces por ciclo de red; cada tirón es un golpe, con un click de contacto y un puñado de modos mecánicos que resuenan. Los dos golpes de cada ciclo no son idénticos, y esa asimetría es la que hace que un zumbador suene a zumbador y no a tono: pone bandas laterales a 60 Hz alrededor del contenido brillante mientras los modos graves repiten a 120 Hz.

Un período se construye plegando la cola de cada modo sobre sí misma, así que el tramo sostenido es exactamente periódico en 735 muestras a 44,1 kHz. La lengüeta igual arranca desde el reposo: los modos pesados tardan más en llegar a su excursión completa que los livianos, y por eso los primeros 300 ms no son loopeables.

El nivel se fija con ponderación A y no con RMS crudo. El oído es mucho más sensible cerca de los 3 kHz que en los 120 Hz del zumbador, así que dos versiones al mismo RMS pueden quedar muy distintas de volumen; ponderar primero deja el nivel percibido quieto mientras se retocan los modos. Los dos formatos salen del mismo archivo, así que tampoco cambia según el navegador.

Regenerar ambos, con ffmpeg en el PATH:

```bash
uv run --with numpy python tools/buzzer.py
```

## El bucle

Reproducir el archivo con `loop = true` produce un golpe audible en cada vuelta, por dos motivos que se resuelven por separado.

El primero es que el archivo es un disparo único: abre y cierra con una rampa. Repetirla reproduce ese hueco una y otra vez.

El segundo es que **no es un tono estacionario**: su banda grave crece alrededor de un 40 % durante los primeros 300 ms, mientras la banda aguda ya está entera desde el primer golpe. Cualquier bucle que incluya ese tramo reinicia el bajo más abajo de donde terminó, y eso se escucha como un bombo periódico.

`loop.js` recorta el bucle del tramo donde la banda grave ya se estabilizó, busca el largo que mejor correlaciona con el arranque —sin asumir periodicidad— y funde la cola sobre la cabeza con un crossfade lineal de 20 ms. El corte cae en 320 ms y el buffer queda en 150 ms; el análisis tarda menos de 20 ms en el hilo principal, así que corre en la primera pulsación sin bloquear nada.

El algoritmo no sabe nada del modelo que generó el sonido y aun así el largo que elige cae siempre en 9 ciclos de red exactos, en ogg y en aac, a 44,1, 48, 88,2, 96 y 192 kHz. Lo que queda en la unión es el ruido de cuantización del codec, no un escalón del bucle: entre −38,6 y −67,8 dBFS según el formato, y nunca más de un tercio del percentil 99 de los saltos entre muestras contiguas del propio archivo. La costura es más suave que los flancos que el sonido ya tiene.

Los umbrales están en milisegundos y no en muestras, para que el resultado no dependa del sample rate al que el navegador abra el `AudioContext`.

Se reproduce con `AudioBufferSourceNode` y `loop = true`, que repite el buffer con exactitud de muestra.

## Compatibilidad

El audio se sirve en Ogg Vorbis, con una copia en AAC que se elige automáticamente cuando el navegador no puede decodificar Vorbis, que es el caso de WebKit. Si la decodificación del formato elegido falla de todas formas, se reintenta con el otro.

La transición de tema usa la View Transitions API y se degrada a un fundido CSS donde no está disponible. `color-mix()` tiene un color de reserva declarado antes.

En iOS hay dos obstáculos distintos. El primero es la política de autoplay: el contexto de audio se desbloquea reproduciendo un buffer silencioso dentro del primer gesto del usuario. El segundo es el interruptor lateral de silencio, que silencia Web Audio porque WebKit lo enruta por la categoría `ambient` del sistema; subir el volumen no cambia nada. Desde iOS 16.4 se corrige declarando `navigator.audioSession.type = 'playback'`, y en versiones anteriores se consigue el mismo cambio de categoría reproduciendo una pista WAV silenciosa en bucle, generada en memoria, dentro de ese mismo primer gesto. La contrapartida es que esa categoría no mezcla: al entrar, pausa el audio que el visitante tuviera sonando.

## Despliegue

Sin paso de compilación. En Cloudflare Pages: preset de framework **None**, comando de build vacío, directorio de salida la raíz del repositorio.

Sin un `404.html` en la raiz, Cloudflare Pages responde cualquier ruta inexistente con un 200 y la portada. Esa pagina existe para que devuelva un 404 de verdad; no lleva scripts, así que no suma hashes a la CSP.

`_headers` fija revalidación en el HTML, en `src/` y en el audio, y una semana en fuentes e iconos. Ningún archivo lleva hash en el nombre, así que ninguno puede marcarse `immutable`: el audio se regeneró dos veces y quien ya hubiera entrado se habría quedado con la primera copia. Fuentes e iconos aguantan una semana porque cambiarlos implica cambiar también el nombre.

El mismo archivo declara una CSP con `default-src 'none'` y permisos explícitos por tipo de recurso. El script de arranque y el `<style>` del `<noscript>` van inline, así que se autorizan por hash. Si se edita cualquiera de los dos hay que recalcular el suyo; el parser normaliza CRLF a LF antes de hashear, de ahí el reemplazo:

```bash
python - <<'PY'
import base64, hashlib, io, re
html = io.open('index.html', encoding='utf-8', newline='').read().replace('\r\n', '\n')
for tag in ('script', 'style'):
    for body in re.findall(f'<{tag}>(.*?)</{tag}>', html, re.S):
        print(tag, 'sha256-' + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode())
PY
```

## Licencia

Copyright (c) 2025-2026 Ezequiel Boussard.

Código y audio bajo licencia MIT. Ver [LICENSE](LICENSE).

La tipografía Outfit es de The Outfit Project Authors y se distribuye bajo SIL Open Font License 1.1, con su texto en [assets/fonts/OFL.txt](assets/fonts/OFL.txt). Esa licencia es independiente de la del resto del proyecto y solo alcanza al archivo de fuente.

Hecho por [Ezequiel Boussard](https://ezequiel.is-a.dev).
