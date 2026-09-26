# StagePrompter v2 — plan de construcción por etapas

## Contexto

El proyecto ya tiene una especificación completa para una reescritura (`docs/spec-v2/`): `ESPECIFICACION.md`, `PLAN-DESARROLLO.md`, `CONTRATO-DATOS.md` + `song-v2.schema.json` + `demo-original.song.json`, `PROMPT-SISTEMA-IA.md`, `DISENO-UI.md` + `diseno-interactivo.html`. El pedido es: (1) verificar que esa especificación sea consistente y construible, y (2) completar el proyecto siguiéndola, dividido en etapas que permitan controlar costo y avance.

La app actual (`public/js/*`) es la versión legacy v1 que la propia especificación audita: sin tiempos en milisegundos, sincronización por scroll/DOM, validador superficial, IndexedDB v1 de un solo store. No hay repositorio Git. El objetivo de este plan es llevar esa base a la "primera versión funcional" descrita en `ESPECIFICACION.md` §1: importar → calibrar audio o base → guardar en IndexedDB → armar setlist → reproducir con letra/acordes/diapasón/tab sincronizados por tiempo → recuperar todo offline.

## Verificación de las especificaciones (hecha)

Leí los 8 documentos de `docs/spec-v2/` (incluido el schema y el JSON demo) y los contrasté con el código y los datos reales del proyecto:

- **Consistencia:** `song-v2.schema.json`, `CONTRATO-DATOS.md` y `demo-original.song.json` concuerdan entre sí en nombres de campos, semántica de `[startMs,endMs)` y catálogo de escalas. `PLAN-DESARROLLO.md` (S0–S9) cubre exactamente los REQ-01..REQ-12 de `ESPECIFICACION.md`. No encontré contradicciones que cambien comportamiento visible para el usuario.
- **Único gap documental:** `PROMPT-MAESTRO.md` referencia `docs/spec-v2/README.md`, que no existe. Es un enlace roto sin consecuencia funcional; no bloquea nada y no hace falta crearlo para avanzar.
- **Verificación contra la realidad actual** (vía auditoría de código de solo lectura, ver evidencia abajo): confirmé los 6 documentos legacy (5 en la raíz + `public/fixtures/songs/all-verses.json`), la colisión real de `id` (`Calamaro estadio azteca.json` y `CalamaroEstadioTabs.json` comparten `andres-calamaro-estadio-azteca`; solo el segundo trae tabs reales), y los bugs de teoría musical que la especificación da por hecho.
- **Dos afirmaciones de la especificación que NO se cumplen en el código actual** (buena noticia, menos trabajo): `chordDiagram.js` ya renderiza 22 trastes, no 12; y ya existe un diagrama de piano completo (`renderPiano`). Ambos son reutilizables tal cual.
- **Bugs confirmados con evidencia de código** (no solo la palabra de la especificación): transposición negativa grande devuelve el string literal `"undefined"` (concatenación de un `NOTES[-1]` real); las tonalidades menores (`"Em"`) no transponen nunca porque `normalizeNote` las mayusculiza a `"EM"` y `indexOf` falla; `m7(b5)` deja simultáneamente la 5ª justa y la b5; `"sus"` sin número cae a tríada mayor; el validador acepta BPM no numérico; `saveSong` hace `put()` sin chequear colisión de `id`; `songRenderer.js` interpola la tonalidad del banner de modulación sin escapar (XSS real, distinto del que ya está mitigado en letras/acordes).

## Qué queda fuera (por diseño, no por omisión)

S9 completo tal como se definió originalmente: MIDI Clock, MTC/LTC, operador remoto, tabs nota-a-nota, audio a otro tono/velocidad. La especificación es explícita: no se anuncian como operativos sin sus adaptadores reales. Este plan no los construye ni los simula.

**Actualización post-C5 (ver "Pivot de alcance" antes de C6):** "seguimiento por micrófono" deja de estar 100% fuera de alcance. Se acota una versión más chica y de menor riesgo que sí se construye (C6/C8): el micrófono **puntúa** una interpretación en vivo contra el reloj/timeline que ya existe (audio local, base generada o avance manual) — nunca lo reemplaza ni decide la posición de reproducción. La versión que seguía siendo "otro proyecto" según `ESPECIFICACION.md` §7 — usar el micrófono para *seguir/sincronizar* una banda en vivo con confianza suficiente para uso escénico — sigue exactamente igual de fuera de alcance que antes.

## Cadencia de trabajo

Once checkpoints (C0–C10), cada uno el "vertical slice" demostrable que pide `PLAN-DESARROLLO.md`. **C0–C5 ya están completos y commiteados** (equivalían a S0–S5; ver estado en cada uno). **C6–C10 son la revisión post-pivot** (ver "Pivot de alcance" antes de C6) y ya no mapean 1:1 contra S6–S8 del documento original — el pivot reordena qué se construye primero y agrega dos capacidades (asistente de carga por audio, evaluador de interpretación) que la especificación original dejaba en S9. Por defecto avanzo de un checkpoint al siguiente sin pedir aprobación en cada uno — reporto qué quedó hecho, qué pruebas corrí y evidencia (capturas/consola vía el navegador integrado) al cerrar cada uno, y sigo. Si se prefiere aprobar uno por uno, se puede pausar en cualquier checkpoint; no hace falta decirlo ahora, se puede pedir en el momento. Cada checkpoint termina con un commit de Git propio.

**Dependencias del proyecto — antes del pivot:** `ajv` (validación) + `esbuild` (solo como `devDependency`, para aplanar el validador generado a un archivo ESM sin imports en tiempo de ejecución — ver C1). Sin framework, sin bundler para el resto del frontend, sin backend con estado.

### Estado de ejecución post-pivot (2026-09-26)

| Checkpoint | Estado | Evidencia o condición abierta |
|---|---|---|
| C6 | Implementado; criterio acústico abierto | [POST-PIVOT-C6-EVIDENCIA.md](POST-PIVOT-C6-EVIDENCIA.md): falta medir micrófono/latencia/contaminación en un navegador con permiso resuelto. |
| C7 | Flujo implementado; análisis armónico experimental | [POST-PIVOT-C7-EVIDENCIA.md](POST-PIVOT-C7-EVIDENCIA.md): BPM sintético razonable; progresión de acordes no fiable y no se probó audio musical real. |
| C8 | No implementado | Las capas de notas/afinación no se presentan hasta completar C6 y validar el análisis de C7. |
| C9 | Completo | [POST-PIVOT-C9-EVIDENCIA.md](POST-PIVOT-C9-EVIDENCIA.md): fullscreen/Wake Lock y teclado comprobados en el navegador integrado. |
| C10 | Base implementada; aceptación offline incompleta | [POST-PIVOT-C10-EVIDENCIA.md](POST-PIVOT-C10-EVIDENCIA.md): faltan prueba sin servidor/red y evidencia final global. |

**Dependencias nuevas que agrega el pivot (única vez que esto cambia en todo el proyecto):** `essentia.js` (MTG-UPF, WASM, npm real) para todo el análisis de audio (croma/HPCP, tempo/beat, onsets, acorde por tríada, altura monofónica) — ver C6/C7/C8. Opcionalmente `whisper.cpp` compilado a WASM (o un envoltorio equivalente) solo para el estiramiento de letra palabra-a-palabra dentro de C7. Ambas se auto-alojan en `public/` (nunca CDN en tiempo de ejecución, para no romper el modo sin conexión) y se cargan de forma perezosa (`import()` dinámico dentro de un Worker, jamás un import estático en un módulo del núcleo) — quien nunca abre el asistente de carga o el evaluador no descarga nada de esto. Detalle de empaquetado exacto en C6.

**Pruebas:** `node:test` (nativo, cero dependencias) para toda la lógica pura (música, timeline, validación) importando los módulos de producción, nunca copias — esto corrige la limitación conocida de `tests/musicEngine.test.js`. Para "automatización de navegador" (importación, persistencia, audio, UI) uso el navegador integrado de esta sesión para ejecutar el flujo real contra el servidor local y reportar evidencia (no se agrega Playwright/Cypress al repo; si se quiere esa suite committeada más adelante, se decide en C10). Para los spikes técnicos de más riesgo (C6, C7) uso el mismo patrón ya establecido de un arnés de depuración en `public/debug/*.html` (como el existente `transport-harness.html`).

---

## C0 — Base y respaldo (= S0) ✅ Completado

**Objetivo:** poder comparar/recuperar el estado actual; cerrar dos huecos de seguridad triviales que no vale la pena arrastrar.

- `git init` + primer commit con todo el árbol actual tal cual (incluye los 6 JSON legacy, `edit.ps1`, todo).
- Correr `npm test` y dejar registrado el resultado (7/7, con su limitación conocida: prueba una copia del algoritmo, no el módulo real).
- Inventario corto de los 6 fixtures legacy y la colisión de ID (ya relevado arriba).
- Dos micro-fixes de una línea, no funcionalidad nueva: `server.js` deja de bindear `0.0.0.0` con CORS comodín por defecto (bind a `localhost`, quitar el header `Access-Control-Allow-Origin: *`); `songRenderer.js` escapa la tonalidad interpolada en el banner de modulación.

**Criterio de cierre:** repo Git con el estado actual recuperable; `npm test` documentado; ninguna función nueva.

## C1 — Contrato, validación y almacenamiento (= S1) ✅ Completado

**Objetivo:** importar una canción v2, rechazar una inválida con ruta exacta del error, y recuperar el mismo documento tras recargar — sin tocar `songs` v1.

- Copiar `docs/spec-v2/contratos/song-v2.schema.json` a `contracts/song-v2.schema.json` (fuente canónica única).
- `scripts/build-validator.cjs`: compila el schema con Ajv (draft 2020-12), sin depender de `ajv-formats` (el schema solo usa `uri`/`date-time`; registro dos formatos a mano para evitar el `require()` de CJS que Ajv inyecta en el código standalone), y pasa el resultado por `esbuild` en modo bundle para producir `public/js/generated/validateSongV2.js` como ESM autocontenido sin imports en runtime. Primeros 30 minutos de este checkpoint: spike empírico de este paso (instalar `ajv`+`esbuild`, generar y cargar el archivo en el navegador) antes de construir el resto, porque es el único punto técnico no verificado hoy.
- `public/js/data/songValidator.js`: reemplazar la validación superficial actual por el validador generado + una segunda pasada de invariantes semánticas (las 12 reglas de `CONTRATO-DATOS.md`: particiones de secciones sin huecos/solapes, anclas dentro de la línea, tokens que cubren el texto sin partir pares subrogados, acordes sin solaparse, `scale.id` conocido, etc.).
- `public/js/data/indexedDb.js`: subir `StagePrompterDB` a versión 2. En `onupgradeneeded` solo crear stores (`songsV2`, `assets`, `setlists`, `settings`), nunca migrar datos ahí. Dejar `songs` intacto. Registrar `onversionchange`/`onblocked` en cada conexión abierta.
- Flujo de importación atómico: validar todo (schema + semántica) antes de abrir cualquier transacción; sin `await` una vez abierta la transacción de escritura; colisión de `id` ofrece reemplazar/duplicar/cancelar mediante una lectura corta previa sin transacción abierta, y una transacción de escritura final que re-chequea. Casos de prueba explícitos: importar con una segunda pestaña abierta (bloqueo informado), fallo a mitad de import (nada queda escrito), import de los dos archivos "Estadio Azteca" (colisión real).
- `public/js/data/legacyImporter.js` (nuevo): asistente que pide una regla de compases/línea o marcas manuales cuando falta tiempo real, y convierte los 6 fixtures a v2 con `timing.status:"estimated"`, sin borrar ni sobrescribir los originales. Mapea `references.youtube_*` a `sources[]`, `line.chords[].position` a `anchor.charOffset` (nunca a tiempo), seis cuerdas de tab legacy a `tabs[].ascii` tras confirmar la convención.

**Archivos clave:** `public/js/data/{indexedDb,songValidator,legacyImporter}.js`, `public/js/generated/validateSongV2.js` (generado), `scripts/build-validator.cjs`, `contracts/song-v2.schema.json`.

**Demo/cierre:** importar `demo-original.song.json`, recargar el navegador, recuperar el mismo documento con los mismos IDs; importar un schema roto (BPM string, ancla huérfana, acordes solapados) y ver el error por ruta; migrar los 6 legacy y confirmar que los originales siguen intactos en `songs`.

## C2 — Motor musical + transporte único (= S2 + S3) ✅ Completado

**Objetivo:** teoría musical correcta sin DOM, y un único reloj (`play/pause/stop/seek/getSnapshot/subscribe/dispose`) que ya puede reproducir la demo de 32 s con clic.

- Extraer de `chordDiagram.js` un módulo puro nuevo `public/js/music/harmony.js` (parser de símbolo, notas de acorde/bajo, clasificación por pitch class) sin estado de módulo oculto (hoy `currentScaleNotes`/`currentScaleId`/`currentTabData` viven implícitos en `chordDiagram.js`); `chordDiagram.js` queda como renderer SVG puro que recibe datos, ya calculados, por parámetro. Esto evita rehacer la teoría musical otra vez en C5 cuando se re-cablean los paneles.
- Corregir los 4 bugs confirmados: módulo negativo en `transpose.js` (`((n%12)+12)%12`), transposición de tonalidades menores, `m7(b5)` (la alteración reemplaza el grado, no lo suma), `"sus"` desconocido preserva el texto y marca "no interpretado" en vez de cifrar como mayor.
- Catálogo de escalas: agregar Hirajoshi/Kumoi/Kumoijoshi por fórmula (ya están en `scales.js` el resto); conservar alias legacy verificados.
- `public/js/timeline/selectors.js`: funciones puras (sección/línea/token/acorde/tab activos dado `positionMs`, por búsqueda binaria sobre arrays ordenados por `startMs`), intervalos semiabiertos, casos borde (evento que termina exactamente en `t`, hueco sin acorde → `null`).
- `public/js/transport/transport.js`: máquina de estados (`idle|loading|ready|playing|paused|ended|error`), modos `audio|generated|manual`. Modelo de reloj por anclas `(anchorClockValue, anchorSongMs, rate)` — pausar/seek solo reemplaza el ancla, nunca acumula. Contador de generación por canción para invalidar callbacks async de una canción ya reemplazada. `dispose()` para el rAF antes que el adapter, adapter antes que liberar recursos (Object URL, nodos).
- `public/js/transport/generatedBacking.js`: reloj `AudioContext.currentTime`, scheduler adelantado (~25 ms de intervalo, ~100 ms de lookahead) para clic + patrón simple; cancelar nodos programados en seek/dispose; cambio de BPM solo en pausa; unidad de negra explícita también en 6/8.
- `public/js/transport/manual.js` + `public/js/stage/inputActions.js` (nuevo, ver nota): índice de bloque sin audio; capa de "acción" (`next-block`, `prev-block`, `toggle-play`, …) desacoplada de qué tecla/pedal la dispara — reutilizable en C6 para mapear pedal HID sin reimplementar los guards de foco/`event.repeat` dos veces.
- Reemplazar `tests/musicEngine.test.js` por pruebas `node:test` que importan `music/harmony.js`, `music/transpose.js`, `timeline/selectors.js` reales.

**Archivos clave:** `public/js/music/harmony.js` (nuevo), `public/js/music/{transpose,scales}.js` (corregidos), `public/js/timeline/selectors.js` (nuevo), `public/js/transport/{transport,generatedBacking,manual}.js` (nuevos), `public/js/stage/inputActions.js` (nuevo).

**Demo/cierre:** suite `node:test` en verde cubriendo los casos de la tabla de `ESPECIFICACION.md` §6 (C#m7(b5), G7(b5), C7sus4, Am/C, C/D, transposición ±13, escala de Bb); arnés de depuración mínimo en navegador que reproduce la demo de 32 s con clic y selecciona el evento correcto en cada frontera; 100 ciclos play/pause/seek sin schedulers/listeners acumulados.

## C3 — Audio local y editor de sincronización (= S4) ✅ Completado

**Objetivo:** asociar un archivo real y corregir tiempos escuchándolo.

- `public/js/transport/audioTrack.js`: adapter `HTMLAudioElement` sobre blob, mismo contrato que `generatedBacking.js`; `songMs = currentTime*1000 - offsetMs`; maneja `waiting/stalled/seeking/ended/error`; rechaza vínculo si `offsetMs + durationMs` excede la duración real del archivo.
- Guardar blob/nombre/tipo/tamaño/duración en el store `assets` (ya creado en C1) dentro de la misma transacción que la canción cuando corresponde; Object URLs solo en memoria de sesión, revocadas al cerrar.
- Editor de calibración: tabla de eventos, marcar inicio/fin en la posición actual, mover selección, desfase global; revalida al guardar.
- Estado estimado/revisado con el hash de revisión local en `settings` (`review:<songId>`) descrito en `CONTRATO-DATOS.md` — nunca se activa solo porque el JSON lo declaraba al importar.
- Loop A/B de ensayo, volumen/mute de pista y clic por separado; BPM bloqueado durante reproducción de audio.

**Archivos clave:** `public/js/transport/audioTrack.js` (nuevo), extensión de `public/js/ui/editor.js` (nuevo/ampliado) para la tabla de eventos.

**Demo/cierre:** vincular un archivo real, corregir 3 marcas escuchando, declarar revisión; pausa/seek mantiene sincronía; error de archivo no destruye la canción; medir el error visual vs. el reloj activo.

## C4 — Prompter (núcleo nuevo, mayor riesgo de UI) (mitad de S5) ✅ Completado

**Objetivo:** la pantalla de lectura en sí, ya con el transporte real.

- Layout de `DISENO-UI.md`: línea activa central, contexto anterior atenuado, siguiente clara; cambia por bloque (no scroll continuo).
- Anclaje de acordes a offsets UTF-16 validados (sin cortar pares subrogados/clusters visibles); resaltado por línea cuando `tokens` está vacío, por palabra/sílaba cuando hay tokens revisados.
- Todo esto lee `timeline/selectors.js` + `transport.getSnapshot()`; cero lectura de scroll/DOM para decidir qué está activo (reemplaza `chordTracker.js`).

**Archivos clave:** nuevo `public/js/rendering/prompter.js` reemplazando el uso de `songRenderer.js` para el modo escenario; `public/js/state/session.js` (nuevo, estado de canción/modo/paneles).

**Demo/cierre:** cambiar tipografía/paneles/orientación no cambia el acorde activo; Am/C muestra raíz A y bajo C; línea sin letra muestra "Instrumental".

## C5 — Paneles: diapasón, piano y tablatura (mitad de S5, más barata que C4) ✅ Completado

*(C4 y C5 terminaron consolidados en una sola vista de lectura/reproducción, con el editor de calibración absorbiendo también toda la edición estructural — ver commits "Fold the harmony... into the player view", "Editor overhaul..." y "Consolidate: one editor, one player...". El resultado cumple y supera el criterio de cierre original de ambos.)*

**Objetivo:** recablear lo que ya existe (diapasón/piano de 22 trastes, ya construidos) contra el estado real en vez de clicks de DOM, más el panel de tab.

- `chordDiagram.js` pasa a recibir `{rootPitchClass, chordTones, bassPitchClass, scaleTones}` ya calculados por `music/harmony.js` (C2), sin leer estado propio.
- `tabRenderer.js`: modos oculto/manual/automático sincronizados por bloque vía `timeline/selectors.js`; sin transposición automática del ASCII; "Sin tablatura en esta sección" cuando corresponde.
- Paneles accesibles (teclado/foco/contraste), preferencias persistidas en `settings` por perfil Ensayo/Escenario.

**Demo/cierre:** entrar a un solo muestra la tab si el modo es automático; ocultarla no se reabre sola; zoom 200% sin cortes.

## Pivot de alcance (post-C5): de repertorio de escenario a atril de práctica con retroalimentación

**Motivo del cambio:** con C0–C5 completos, el pedido pasó de "leer en el escenario" a algo más ambicioso — si la app puede reconocer tonalidad/acordes por audio, eso abre funciones de estudio en profundidad más cercanas al objetivo original del proyecto ("estudio en profundidad de piezas musicales") que terminar de pulir herramientas de gira. Dos ideas concretas, en el orden de prioridad indicado explícitamente:

1. **Evaluador de interpretación** (indicado como lo más útil): el músico toca la pieza real, la app escucha por micrófono y compara contra el mismo timeline de referencia que ya existe en el `SongDocument` — ¿llegó a los acentos rítmicos a tiempo?, ¿la afinación fue correcta? Es una versión acotada y de menor riesgo de lo que la especificación original (`ESPECIFICACION.md` §7, `PLAN-DESARROLLO.md` S9) dejaba fuera como "seguimiento por micrófono", con una diferencia clave que la vuelve mucho más abordable: no necesita *seguir* una posición desconocida, solo **puntuar** contra una posición que el transporte ya conoce (audio real, base generada o avance manual). La especificación ya advertía por qué "seguir" es otro proyecto (§7: "no equiparar transcribir voz con seguir con fiabilidad una banda en vivo"); puntuar contra un reloj ya conocido no tiene ese problema.
2. **Asistente de carga por audio** (prioridad secundaria, pedida igual explícitamente): bajar la fricción de cargar una canción nueva generando un borrador de JSON v2 a partir de un archivo de audio local, en vez de partir de una canción vacía en el editor.

Herramienta indicada explícitamente para ambas: **essentia.js** (MTG-UPF, WASM, publicado en npm) para todo el análisis de señal — confirmado que expone detección de onsets, seguimiento de tempo/beat, extracción de altura/melodía, estimación de tonalidad **y un algoritmo de acordes ya integrado** (a partir de HPCP/croma, entrega tríadas mayor/menor como texto). Mejor de lo estimado en un principio: hay reconocimiento de acordes de base ya resuelto, no hay que construirlo desde cero — conviene sí una capa propia liviana encima (reusando `music/harmony.js`) para cubrir 7as/sus/etc., que la tríada básica no distingue. Para letra palabra-a-palabra, opcionalmente **whisper.cpp** compilado a WASM — confirmado que corre 100% en navegador/offline y soporta timestamps por palabra.

**Qué se saca para pagar esto:**
- Setlist multi-canción (CRUD, orden) y el mapeo de pedal *a semántica de setlist* ("avanzar a la siguiente canción del show") se difieren a una extensión futura documentada. **Precisión:** esto no es "sacar el pedal" — `stage/inputActions.js` (capa de acciones desacoplada de qué tecla/pedal dispara qué) ya existe y ya está conectada en `playerView.js`; lo que se difiere es la semántica de *lista de canciones*, no el soporte de pedal en sí.
- Las alertas locales/críticas de escenario se difieren con lo anterior (dependían del setlist: "aviso antes del cambio de canción").
- Se mantiene, porque ya existe y es casi gratis: pantalla completa + Wake Lock (`stage/wakeLock.js`).
- Offline/exportación/endurecimiento de `server.js`/guion de aceptación final se mantienen con la misma prioridad — son promesas centrales, no herramientas de gira — pero su tabla de soportado/no soportado ahora debe reflejar con honestidad la madurez real de cada función nueva (C10), misma regla que ya rige el proyecto (`PROMPT-MAESTRO.md`: nunca presentar "escucha IA" como funcionalidad completa antes de que su propia prueba de aceptación pase).

**Sobre "motor MIDI":** no se construye un motor MIDI de entrada/salida real (importar/exportar `.mid`, sincronía con hardware por Web MIDI) — sigue siendo el ítem "MIDI Clock" de S9, sin cambios, fuera de alcance. Lo que sí se aprovecha: si el análisis de essentia.js (C7) produce datos de altura nota-a-nota utilizables, esa misma información enriquece `generatedBacking.js` (notas reales en vez de solo clic) y alimenta el tier 2 del evaluador (C8) — subproducto del mismo pipeline, no una función aparte a mantener por separado.

**Sobre "pasarle un video de YouTube":** ajustado por una razón legal/técnica, no de preferencia. Este plan no agrega descarga de audio desde una URL de YouTube (sus términos de servicio no permiten descarga programática; `ui/videoSection.js` ya trata esos enlaces solo como referencia — miniatura + link, nunca fetch de medios, confirmado sin cambios). Lo que sí se construye: el usuario elige un archivo de audio o video **local** que ya tiene consigo; si es video, la pista de audio se extrae en el propio navegador (`decodeAudioData`, sin red). Mismo resultado práctico, sin que la app dependa de una descarga externa.

**Excepción arquitectónica a anotar, no esconder:** `ESPECIFICACION.md` §5 pide reproducir con `HTMLAudioElement` y nunca decodificar una pista larga completa a `AudioBuffer` (por memoria), regla que `transport/audioTrack.js` ya sigue. El análisis por essentia.js/whisper necesita el PCM completo, así que "analizar este archivo" (C7, un solo uso, dentro de un Worker, nunca en el camino de reproducción) es una excepción acotada y explícita — la reproducción real en ensayo/escenario no cambia.

**Riesgo nuevo a vigilar, no obvio de entrada:** si el músico toca junto a la base/pista de referencia sonando por parlantes, el micrófono capta interpretación y referencia mezcladas — señal alta y limpia no distingue una cosa de la otra. El spike de C6 mide esto explícitamente (auriculares vs. parlantes vs. referencia silenciada) y su resultado condiciona qué modos quedan habilitados.

---

## C6 — Evaluador de interpretación, tier 1: ritmo y acentos (nueva máxima prioridad)

**Objetivo:** el músico toca en vivo y la app puntúa qué tan cerca cayó cada ataque respecto de los tiempos ya conocidos del `SongDocument` — el tier más barato, más confiable y menos dependiente del instrumento, el que sirve directamente la prioridad pedida.

- **Spike primero** (mismo patrón que el de Ajv en C1: primera parte de este checkpoint, no uno aparte): `public/debug/mic-latency-harness.html` — `getUserMedia` → `AudioWorklet` (ring buffer) → medir resolución de tiempo alcanzable, y probar explícitamente el riesgo de "sangrado" (parlantes vs. auriculares vs. referencia silenciada). El resultado escrito condiciona el resto del checkpoint.
- Arnés paralelo `public/debug/essentia-worker-harness.html`: cargar `essentia.js` en un Worker (import dinámico, nunca estático) contra un archivo real y confirmar qué algoritmos hacen falta para este tier (onsets, beat tracking) — más simple que el pipeline de acordes de C7.
- `public/js/audio/micCapture.js`: envuelve `getUserMedia` + `AudioContext` + `AudioWorkletNode`; expone `start()/stop()/onFrame(cb)` con métrica de calidad de señal (RMS/clipping) por frame; `dispose()` corta el micrófono siempre.
- `public/js/audio/audio-worklet-processor.js`: el `AudioWorkletProcessor` en sí, solo framer/ring-buffer; el análisis pesado corre en un Worker aparte, nunca en el hilo de audio.
- `public/js/timeline/grid.js` (nuevo): extrae a un módulo puro y testeado la fórmula de grilla de pulso/compás que hoy vive inline en `legacyImporter.js` — la necesitan tanto el importador legacy como este evaluador.
- `public/js/audio/onsetMatcher.js`: función(es) puras — timestamps de ataque detectados vs. esperados (`chords[].startMs` + pulso de `timeline/grid.js`) → tasa de acierto/desvío medio. Testeable con fixtures a mano, sin Worker/WASM.
- `public/js/ui/performanceEvaluator.js` (nuevo, mismo patrón `open*(song, onClose)`): reusa el transporte de la canción como único reloj (nunca uno segundo relativo al AudioContext del mic); medidor de calidad de señal siempre visible; cada tier se muestra solo cuando pasó su propio criterio de cierre.
- `playerView.js`: nueva entrada junto a Diapasón/Tablatura, abre el evaluador como panel adicional.

**Archivos clave:** `public/debug/{mic-latency-harness,essentia-worker-harness}.html`, `public/js/audio/{micCapture,audio-worklet-processor,onsetMatcher}.js`, `public/js/timeline/grid.js` (nuevo, + refactor de `legacyImporter.js`), `public/js/ui/performanceEvaluator.js` (nuevo), `playerView.js` (extendido). `essentia.js` instalado por npm para fijar versión, servido auto-alojado desde `public/` (nunca CDN) — mecánica exacta de build a confirmar en el spike.

**Demo/cierre:** spike documentado por escrito (tolerancia medida; si parlantes-sin-auriculares queda inhabilitado o degradado); tocar un ritmo contra los cambios de acorde de la demo puntúa correctamente a tiempo y deliberadamente desviado, dentro de la tolerancia medida; nunca puntúa con el medidor de señal bajo.

## C7 — Asistente de carga por audio (borrador desde archivo local)

**Objetivo:** bajar la fricción de cargar una canción — de un archivo de audio local a un borrador de `SongDocument` v2 que abre directo en el editor de calibración, nunca marcado como revisado.

- Reutiliza el Worker de essentia.js levantado en C6.
- `public/js/audio/decodeLocalFile.js`: `File`/`Blob` (audio o video) → `decodeAudioData()` → `{pcm, sampleRate, durationMs}`. Un solo uso, dentro de un Worker (ver excepción anotada arriba).
- `public/js/audio/essentiaWorker.js`: agrega tempo/beat, tonalidad, croma/HPCP y el detector de acordes (tríada) ya integrado en essentia.js.
- `public/js/audio/chordTemplateMatch.js`: función(es) puras — toma el croma ya calculado y, reusando `music/harmony.js`, extiende la tríada a 7as/sus/etc. cuando el ajuste es claramente mejor. Testeable con vectores de croma a mano.
- `public/js/audio/segmentation.js`: función pura — de beats/onsets arma secciones y las recorta para que sean partición exacta y sin huecos de `[0,durationMs)`, porque `data/songSemantics.js` lo exige (trabajo real: los límites que da Essentia no vienen ya partidos así).
- `public/js/audio/draftBuilder.js`: arma un documento que pasa `validateSongV2` a la primera: `timing:{status:'estimated', method:'auto-analyzed', notes:...}`, ítems de baja confianza a `reviewWarnings[]` (nunca un campo numérico nuevo en el schema).
- **Cambio de contrato chico pero real:** agregar `"auto-analyzed"` al enum de `timing.method` en `contracts/song-v2.schema.json` (hoy solo `grid`/`manual`/`aligned` — no reusar `"aligned"`, que en `CONTRATO-DATOS.md` ya implica evidencia temporal real, certeza distinta a una primera estimación automática). Requiere re-correr `scripts/build-validator.cjs` y dejarlo anotado — se agrega la primera sección de changelog de schema del proyecto en `CONTRATO-DATOS.md`.
- `public/js/ui/audioDraftAssistant.js` (nuevo, mismo patrón `open*`): selector de archivo → progreso → vista previa → "Crear borrador" → mismo flujo de colisión que IMPORTAR → abre `openCalibrationEditor` sobre el resultado. Ofrece guardar el archivo analizado como el audio de la canción para no pedir que se vuelva a adjuntar.
- `index.html`/`app.js`: nuevo botón "Generar borrador desde audio" junto a IMPORTAR/NUEVA.
- **Estiramiento opcional, solo si el borrador principal ya funciona:** `public/js/audio/whisperWorker.js` (Worker propio, ciclo de descarga de modelo separado del de essentia.js) + `public/js/audio/lyricsAlign.js` — usa Whisper solo para tiempos y alinea esas palabras contra `lines[].text` ya existente (no confía en su transcripción como letra: audio cantado es más difícil para ASR que habla limpia, y la mayoría de estas canciones ya tienen letra correcta), emitiendo `tokens[]` solo donde el ajuste es de alta confianza. Ajuste chico necesario en `calibrationEditor.js`: si el usuario edita `line.text` después, limpiar (u ofrecer limpiar) los `tokens` de esa línea, o la regla de cobertura de tokens del validador rechaza el guardado sin que quede claro por qué.

**Archivos clave:** `public/js/audio/{decodeLocalFile,essentiaWorker,chordTemplateMatch,segmentation,draftBuilder}.js` (nuevos), `public/js/ui/audioDraftAssistant.js` (nuevo), `contracts/song-v2.schema.json` + `CONTRATO-DATOS.md` (enum nuevo), estiramiento opcional `public/js/audio/{whisperWorker,lyricsAlign}.js`.

**Demo/cierre:** con un audio real de una canción, "Generar borrador desde audio" produce un documento válido (`estimated`/`auto-analyzed`) con acordes sin solapes y secciones sin huecos, abre directo en el editor; "Declarar revisado" sigue bloqueado hasta interacción real. Si se intenta Whisper: `tokens` coinciden con la letra existente donde hay alta confianza, vacíos donde no.

## C8 — Evaluador de interpretación, tiers 2 y 3: notas correctas y afinación en solos

**Objetivo:** sumar al evaluador de C6 dos capas apoyadas en lo que construyó C7.

- `public/js/music/chromaMatch.js`: función(es) puras — croma en vivo vs. notas del acorde esperado (reusa `getChordTones(...)` de `music/harmony.js`) → puntaje "dentro/fuera del acorde". No promete precisión por cuerda. *(Puede empezar en paralelo con la parte más difícil de C7 — solo necesita croma + el motor de teoría musical ya existente.)*
- `public/js/audio/pitchTracker.js`: envuelve el rastreo de altura de essentia.js (mismo Worker) → `{timeMs, midiPitch, confidence}`. **Acotado a secciones `type:'solo'`** (valor de enum que el schema ya tiene) más anulación manual en la UI. Matemática de centésimas coherente con la convención ya usada en `rendering/chordDiagram.js`. **Explícitamente fuera:** afinación por cuerda de un acorde rasgueado completo — problema de investigación, no se intenta ni como estiramiento.
- `ui/performanceEvaluator.js`: cada tier aparece solo cuando pasó su propio criterio de cierre.

**Archivos clave:** `public/js/music/chromaMatch.js` (nuevo), `public/js/audio/pitchTracker.js` (nuevo), extensión de `performanceEvaluator.js`.

**Demo/cierre:** tier 2 — un acorde sostenido muestra "dentro/fuera" coherente con las mismas notas que ya se ven en el diapasón. Tier 3 — una nota sola sostenida en una sección `solo` da desviación en centésimas estable, coherente con un afinador de referencia, dentro de la precisión medida en el spike de C6; fuera de esa condición, no se muestra número de afinación.

## C9 — Escenario reducido: pantalla completa y Wake Lock

**Objetivo:** lo que queda del antiguo "modo escenario" tras diferir setlist/pedal-de-setlist/alertas — barato porque ya existe la base.

- Fullscreen + Wake Lock por detección de soporte (`stage/wakeLock.js`, conservar), entrar/salir sin duplicar listeners.
- Confirmar que `stage/inputActions.js` (de C2) sigue sirviendo Espacio/flechas/Esc en `playerView.js`.
- Nota explícita de que setlist multi-canción y pedal-para-avanzar-de-canción quedan como extensión futura documentada.

**Demo/cierre:** entrar/salir de pantalla completa no duplica listeners ni pierde el Wake Lock; Espacio/flechas/Esc responden igual que antes del pivot.

## C10 — Offline, exportación y cierre de MVP

**Objetivo:** preparar, desconectar y ejecutar; entregar límites verificados, incluidos los de las dos capacidades nuevas.

- Service Worker con **tres cachés, no dos**: shell (siempre precacheado, incluye el validador generado), assets del set actual (bajo demanda), y una caché aparte de "herramientas pesadas opcionales" (WASM de essentia.js + modelo de Whisper si se construyó el estiramiento) — se llena solo la primera vez que se usa el asistente/evaluador, versionada aparte para que un update del shell no fuerce redescargar decenas/cientos de MB, y **excluida** del chequeo de "Preparado sin conexión" (ese badge no debe insinuar que el asistente está listo sin conexión si nunca se abrió estando online).
- Cuota/persistencia (`navigator.storage.persist()`/`estimate()`); si el modelo de Whisper no entra en cuota, mensaje distinto al de "no entra el repertorio".
- Export/backup JSON (sin blobs salvo paquete explícito).
- `server.js`: resolución de `URL.pathname` confinada a `public/`, tabla MIME real, `HEAD`, `GET /health`.
- Guion de aceptación final: además de las 10 condiciones globales de `ESPECIFICACION.md` §10, tabla soportado/no soportado que documente honestamente cada tier del evaluador (ritmo / notas correctas / afinación en solos) y el asistente de carga (con o sin Whisper) por separado.

**Demo/cierre:** desconectar internet + detener Node, reabrir el mismo origen, repertorio y audio siguen disponibles (el asistente/evaluador no, salvo uso previo online). Entregable final: tabla soportado/no soportado ampliada, límites conocidos, evidencia de las 10 condiciones globales.

---

## Trazabilidad (REQ → checkpoint)

| Requisito | Checkpoint |
|---|---|
| REQ-01 Biblioteca / REQ-02 Editor | C1 (+ C3 para tiempos, C7 para el borrador automático) |
| REQ-03 Audio y base / REQ-06 Transporte | C2 + C3 |
| REQ-04 Tiempos honestos | C1 + C3 (+ C7 para el nuevo `method:"auto-analyzed"`) |
| REQ-07/08 Prompter y karaoke | C4 (+ C7 estiramiento Whisper para `tokens` automáticos) |
| REQ-09 Paneles (diapasón/tab) | C2 + C5 |
| REQ-05 Setlist / REQ-11 Avisos | Diferido (ver "Pivot de alcance") |
| REQ-10 Pedal | C2 (input layer, ya activo) + C9 (solo semántica de setlist diferida) |
| REQ-12 Recuperación/offline | C3 + C10 |
| *(Nuevo)* Evaluador de interpretación | C6 (ritmo) + C8 (notas/afinación) |
| *(Nuevo)* Asistente de carga por audio | C7 |

## Verificación end-to-end

- `npm test` en cada checkpoint que toque lógica pura (debe seguir en verde, ahora contra módulos reales).
- Navegador integrado de esta sesión: sirvo `server.js`, ejecuto el flujo real (importar/reproducir/escenario/offline) y reporto evidencia (consola, capturas) al cerrar cada checkpoint — no declaro un checkpoint cerrado solo porque compiló o porque pasaron los unit tests.
- Comando reproducible del propio contrato para validar el schema del demo: `npx --yes --package=ajv-cli --package=ajv-formats ajv validate --spec=draft2020 -c ajv-formats -s docs/spec-v2/contratos/song-v2.schema.json -d docs/spec-v2/contratos/demo-original.song.json` (repetir tras el cambio de enum de C7).
- Para C6/C7, los spikes técnicos (mic-latency, essentia-worker) son arneses HTML en `public/debug/`, mismo patrón que `transport-harness.html`; su hallazgo se documenta por escrito antes de seguir construyendo sobre ellos, igual que el spike de Ajv en C1.
- Commit de Git al cierre de cada checkpoint, para que cualquier etapa sea revisable/recuperable de forma independiente.

## Fuentes consultadas para este pivot

- [Audio and Music Analysis on the Web using Essentia.js (ISMIR/TISMIR)](https://transactions.ismir.net/articles/10.5334/tismir.111) y [essentia.js — Getting started](https://mtg.github.io/essentia.js/docs/api/tutorial-1.%20Getting%20started.html): confirman WASM real, npm real, y el algoritmo de acordes (tríadas mayor/menor por HPCP) ya integrado, además de onsets/beat/tempo/altura/tonalidad.
- [whisper.cpp — ejemplo WASM en navegador](https://ggml.ai/whisper.cpp/) y su repositorio [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp): confirman transcripción 100% en navegador/offline y timestamps por palabra (`-ml 1`).
