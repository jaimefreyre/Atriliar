# EP — Prototipo navegable

Estado: **listo para tu revisión**. Según el plan, necesita tu aprobación antes de E2b, donde se construye el shell real. E1 (motor armónico) y E2a (modelo de datos) no dependen de esta aprobación.

## Cómo abrirlo

Con el servidor en marcha: `http://localhost:3000/debug/prototipo.html`.

Está en `public/debug/` y no en `docs/rediseno/` como decía el plan, para que lo sirva el mismo servidor con los CSS reales. `debug/` queda fuera del precache del service worker. La barra violeta de arriba es solo del prototipo: trae el selector "Estado de ejemplo" y los atajos (Espacio reproduce, 1–5 cambian de modo).

## Qué se construyó

- **`public/css/tokens.css`**: el sistema de diseño en tres niveles (paleta, roles, escala de UI):
  - tema oscuro derivado de la paleta de escenario: amarillo = lo que suena ahora, cian = armonía y acento, ámbar = estimado, verde = confirmado, violeta = loop y samples;
  - espaciado, tipografía en rem, radios y escala de z-index;
  - variantes para alto contraste de Windows (`forced-colors`).
- **`public/css/components.css`**: componentes con prefijo `sp-` sobre capas de cascada, sin reset global:
  - la estructura: shell, barra superior, pestañas de modo, lienzo, inspector y dock;
  - los controles: botones, controles segmentados hechos con radios nativos, popovers y diálogos;
  - las piezas de cada modo: carriles, fichas de acorde con estado visible (no solo por color), hoja de cifrado, prompter, compases del Atril, pads y arreglador;
  - biblioteca, avisos, progreso, medidor y notificaciones.
- **`public/debug/prototipo.html` + `prototipo.js`**: la biblioteca y los cinco modos con los datos de la canción demo del contrato, sobre un reloj simulado que comparten todos los modos.

## Recorrido verificado en el navegador integrado

- **Biblioteca.** Zona para soltar audio, lista con estados (estimado, borrador, samples, v1 a convertir) y acciones. "Nueva desde audio" muestra el progreso del análisis y abre Autopsia.
- **Autopsia.**
  - Carriles alineados: secciones, acordes, pulsos y onda, con el cabezal amarillo.
  - La perilla "Sensibilidad de cambios" alterna 12, 14 y 18 cambios (Estable, Normal, Detallada). Los acordes confirmados se mantienen en las tres.
  - El inspector muestra alternativas ("mismas notas", "color", "otra raíz"), diapasón y evidencia plegada.
  - "Separar pistas" abre un `<dialog>` nativo. Tras el progreso aparecen 6 carriles de pistas con mudo y solo, y el popover de guía suma "Sin voz", "Sin guitarra", "Solo bajo y batería" y "Mezcla de la loopera".
  - "Enviar a la Loopera" crea un pad.
- **Cifrado.** Hoja por secciones con los acordes sobre la palabra (el dudoso en ámbar), la línea seleccionada con sus tiempos en el inspector y la tablatura del cierre.
- **Loopera.** Pads, arreglo de 8 compases, grabar capa (R), metrónomo, cuenta regresiva, cuantización y exportación WAV/MIDI. En el dock, "(cambia el tono)".
- **Karaoke.** Prompter con la línea actual grande y los acordes encima, y la escucha en vivo de a una vista: cotejo, afinador, radar o espectro.
- **Atril.** Compases de la sección con el actual resaltado y el pulso, la letra actual y la siguiente, y un dock mínimo. Al reproducir avanzan el compás y el pulso.
- **Estados especiales.** Biblioteca vacía, analizando, separando (con cancelar), sin micrófono (Karaoke sigue sin escucha) y audio faltante (el Atril sigue con el clic). Cada uno muestra su mensaje.
- **Ancho.** Sin desborde horizontal en ningún modo, ni a 1280 px ni a 375 px. En celular queda en una columna y las pestañas de modo se desplazan en una fila.
- **Consola.** Sin errores.

## Correcciones que salieron de la prueba

- Las palabras de la línea actual del prompter quedaban pegadas y desalineadas; ahora el renglón es flex.
- El inspector oculto dejaba una barra de scroll horizontal; ahora se retira de la grilla.
- A 375 px la grilla del shell se estiraba al ancho mínimo de su contenido. Se corrigió con una columna `minmax(0, 1fr)` y con la consulta de contenedor movida al shell (una consulta de contenedor no puede estilar a su propio contenedor).
- Fichas y grupos del dock: `border-box` y salto de línea.
- La guarda nueva de contraste encontró el texto sobre el rojo de "Grabando" en 3,58:1; ahora cumple AA.

## Pruebas

`npm test`: 187/187. Se sumó `tests/css/tokenContrast.test.js`, que resuelve los tokens y exige 4,5:1 en todos los pares de texto y fondo.

## Notas para las etapas siguientes

- En pantallas angostas, la línea de tiempo real (E3a) debería arrancar con zoom de unos 8 compases: a canción completa las fichas quedan chicas. El minimapa ya está previsto para navegar.
- Los popovers del dock se posicionan con las coordenadas del botón: según la guía de buenas prácticas, el anclaje por CSS todavía no está en Chrome/Edge. Donde falta la API de popover hay un respaldo manual, sin polyfill por CDN porque la app funciona sin conexión.
