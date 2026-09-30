# E0 — Estabilizar la base

Estado: **cerrada**, con una verificación hecha fuera del navegador (ver "Límite del entorno").

## Qué se hizo

- **Base guardada.** El trabajo pendiente del laboratorio se commiteó en `v2-laboratorio` (`cf21f6b`, etiqueta `pre-rediseno-v3`) y el rediseño sigue en la rama `v3-rediseno`.
- **Transporte con audio real.** `play()`, `seek()` y `stop()` volvían a anclar el reloj antes de que el adaptador reposicionara el `<audio>`. Buscar mientras sonaba mostraba una posición corrida (hacia adelante, `2·destino − origen`), y detener y volver a reproducir quedaba atrasado. Ahora se ancla después del reposicionamiento, y `stop()` lleva el medio a 0.
- **Service worker.** La lista de archivos a precachear ahora la genera `npm run build:shell` a partir de `public/` (73 archivos; antes faltaba `music/chromaMatch.js` y la app entera no cargaba sin conexión). El nombre de la caché cambia cuando cambia algún archivo. El shell propio se sirve con red primero: con conexión siempre corre el código actual; sin conexión, la última copia. `/api/*` y `/health` nunca pasan por la caché.
- **Micrófono.** El worklet fechaba los cuadros con un contador propio que arrancaba al crear el nodo, así que los ataques salían corridos por el tiempo de carga de Essentia. Ahora usa el `currentFrame` global del `AudioContext`. El worker de armonía recibe `timestampMs` (antes llegaba `NaN` y la compensación de latencia del karaoke nunca se aplicaba).
- **Loopera.** Espacio reproduce/pausa y R graba una capa (antes Espacio grababa y el texto de ayuda decía lo contrario). La grabación se hace sin cancelación de eco, supresión de ruido ni ganancia automática.
- **Karaoke.** El interruptor "Comparar con el audio" respeta la preferencia guardada (el atributo `checked="false"` lo dejaba siempre activado).
- **Reproductor y evaluador.** Esc cierra solo el evaluador y no todo el reproductor. Cerrar el reproductor también cierra el evaluador: antes seguían vivos su temporizador, la suscripción al transporte y el micrófono.
- **Otras fugas.** El visualizador cierra su `AudioContext` MIDI al descartarse (se creaba uno nuevo en cada reanálisis). Revincular audio en el editor usa un asset nuevo en lugar de sobrescribir el que puede compartir un laboratorio.
- **Base de datos.** Si otra versión más nueva ya actualizó la base, se abre en su versión actual en lugar de fallar (necesario antes de subir la versión en E2a).

## Verificación

- `npm test`: 185/185. Pruebas nuevas:
  - transporte con un adaptador que se comporta como `<audio>`: 3 de ellas fallaban con el código viejo;
  - marcas de tiempo del worklet, ejecutado en un entorno `AudioWorklet` simulado;
  - comportamiento del service worker (instalación, red primero, respaldo sin conexión, API sin interceptar), ejecutado en Node con red y cachés simuladas;
  - guardas: el manifiesto del SW está al día y todo import relativo de `public/js` existe.
- Navegador integrado, servidor propio en el puerto 3100:
  - con un `<audio>` real, la posición del transporte coincidió con la del elemento al buscar 10 s hacia adelante mientras sonaba, 3 s hacia atrás, y al detener y volver a reproducir;
  - en el reproductor, Esc cerró solo el evaluador;
  - con el evaluador abierto, cerrar el reproductor no dejó ningún temporizador activo;
  - en el laboratorio, el interruptor quedó apagado con la preferencia "no comparar", Espacio reprodujo y pausó la loopera, y R pidió el micrófono para grabar.

## Límite del entorno

El navegador integrado de esta sesión no puede registrar service workers en ningún origen: tanto en 3100 como en 3000 da "An unknown error occurred when fetching the script", aunque el servidor responde bien a esa petición. Por eso la recarga sin conexión con el servidor detenido se verificó con las pruebas de comportamiento del SW en Node, no en un navegador. Falta repetirla en Chrome o Edge. El micrófono tampoco se habilita en este navegador: la grabación y la escucha en vivo no se probaron con audio real.
