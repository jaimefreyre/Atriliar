# Prompt para continuar el rediseño de StagePrompter (E2a → E8)

> Copiá todo lo que está debajo de la línea y pegalo como primer mensaje al modelo que va a continuar el trabajo, abierto en la carpeta del proyecto.

---

Sos el desarrollador que continúa el rediseño de **StagePrompter**, una app web local (Node + navegador, sin nube) para músicos. La app convierte cualquier audio en un **atril** para tocar, con audio guía. Además es un analizador de audio y sirve para extraer samples para una loopera. Trabajás en el repositorio de la carpeta actual, en la rama **`v3-rediseno`**.

## 1. Situación actual (leer antes de tocar nada)

La queja original del usuario, textual:

> "Está toda encimada, no tiene un buen UX y tampoco es completamente funcional. Hay que cambiar totalmente el UX pero mantener todas las funciones… el diseño no es bueno del karaoke, la loopera, el analizador y la autopsia multipista."

Documentos obligatorios, en este orden:

1. `docs/rediseno/PLAN-REDISENO.md`: **el plan aprobado**. Contiene:
   - la arquitectura de información;
   - la tabla de modos;
   - los reemplazos intencionales;
   - la arquitectura técnica;
   - las etapas E0–E8 con su cierre;
   - el Anexo A (motor armónico), el Anexo B (migración de datos) y el Anexo C (dónde queda cada función actual).
2. `docs/rediseno/E0-EVIDENCIA.md`, `EP-EVIDENCIA.md` y `E1-EVIDENCIA.md`: qué ya está hecho, cómo se verificó y qué límites quedaron.
3. `public/debug/prototipo.html` + `public/debug/prototipo.js`: **el prototipo navegable aprobado**. Abrilo en `http://localhost:3100/debug/prototipo.html`. Cubre:
   - la biblioteca y los 5 modos;
   - los estados vacío / analizando / separando / sin micrófono / audio faltante (selector "Estado de ejemplo").

   Es la referencia visual y de interacción: la app real tiene que verse y comportarse así.
4. `public/css/tokens.css` y `public/css/components.css`: el **sistema de diseño real**. Tiene tokens en tres niveles, componentes con prefijo `sp-` y capas `@layer reset, tokens, base, components, utilities`. Tiene una prueba de contraste AA en `tests/css/tokenContrast.test.js`.
5. `docs/spec-v2/contratos/CONTRATO-DATOS.md` y `song-v2.schema.json`: el contrato SongDocument v2. **No cambia.**
6. `MANUAL-INSTALACION-USO.md`: cómo se usa hoy.

**Etapas cerradas:**
- **E0:** transporte, service worker con manifiesto generado y marcas de tiempo del micrófono.
- **EP:** sistema de diseño y prototipo.
- **E1:** motor armónico v6 en `public/js/harmony/`. Es una sola pista de acordes con "Sensibilidad de cambios", y las ediciones del músico quedan como restricciones. Incluye la migración v5→v6, el rastreador en vivo y el banco de pruebas.

**La app que ve el usuario todavía es la vieja.** El laboratorio es una página de ~1.200 líneas: `public/js/ui/audioDraftAssistant.js`, `audioAnalysisVisualizer.js`, `multitrackWorkspace.js` y `css/audio-draft.css`. Tu trabajo es reemplazarla por el diseño del prototipo.

## 2. Qué tenés que hacer

Ejecutá las etapas pendientes del plan, **en orden y de a una**:

**E2a → E2b → E3a → E3b → E4 → E5a → E5b → E6 → (E7 opcional) → E8.**

Reordenamientos permitidos por el plan:
- E3b después de E5a;
- E6 antes de E5b.

Resumen de cada etapa. El detalle está en el plan y manda sobre este resumen.

- **E2a · Modelo unificado.** Nuevos stores de IndexedDB:
  - `projects`, 1:1 con la canción, con clave `songId`;
  - `analyses`, por canción + fuente + versión del motor. Se escribe una vez por análisis, **nunca** en el autoguardado.

  La versión de la base pasa de 3 a 4. Ya existe tolerancia a `VersionError` en `data/indexedDb.js`.

  Archivos nuevos:
  - `data/projectRepo.js` y `data/projectModel.js`;
  - `data/migrations/v4Projects.js`: función pura más ejecutor, fuera de `onupgradeneeded`, idempotente con `settings['migration:v4:lab:<id>']`, con reporte guardado y respaldo previo descargable;
  - `data/chartSync.js`: los acordes del cifrado son una **proyección determinista** de `analysis.harmony` (la pista v6), con ids estables `ch-<startMs>`, ancla a la palabra más cercana, `bassNote` en slash y automáticos marcados como estimados;
  - `data/backup.js`: respaldo JSON v2 con proyectos.

  Cubrí cada caso del Anexo B. "Actualizar cifrado" actualiza **siempre la misma canción** y nunca crea duplicados. Hoy el usuario ya tiene "Vos también estabas verde" duplicada (v1 + v2).
- **E2b · Shell y biblioteca.** Crear:
  - `ui/components/dialogs.js`, con `<dialog>` nativo y avisos (toasts), que reemplaza los 17 `alert/confirm`;
  - `ui/shell/{router,appShell,dock,inspectorHost,keymap,legacyHost}.js`, con rutas `#/`, `#/cancion/<id>/<modo>` y recarga que conserva ruta y posición en pausa;
  - `ui/library/libraryView.js`, con "Nueva desde audio", búsqueda, estados por canción, almacenamiento y grupo v1 con "Convertir".

  `app.js` queda como arranque corto. Las vistas viejas se alojan dentro del shell (`legacyHost`, con su CSS inyectado solo mientras están montadas) hasta que se reemplacen. La bandera `ui:shell` lleva escape `?ui=legacy` hasta E8. **Cierre:** toda función existente es alcanzable por una ruta.
- **E3a · Autopsia.** Incluye:
  - `audio/engine.js`, con un solo `AudioContext`;
  - `transport/mediaClock.js`;
  - `audio/analysisService.js`, con progreso y cancelar;
  - `ui/timeline/*`: onda, grilla con downbeat, secciones, carril de **acordes** sobre la pista v6 y evidencia por golpe de solo lectura;
  - el inspector de acorde: alternativas, confirmar, dividir, unir, mover límite, "aplicar a repeticiones" y cajón de evidencia. Usá `applyUserEdit` de `harmony/harmonyTrack.js`, que ya existe y está probado;
  - `ui/components/instrumentPanel.js` y `audio/sampleCapture.js`.

  **Cierre:** audio → cambios detectados → corregir/confirmar → "Actualizar cifrado" → cifrado válido.
- **E3b · Multipista y guías.** Incluye:
  - panel de fuentes y carriles de stems (M/S, análisis persistido, "usar como fuente armónica": agudos desde la mezcla sin voz y bajo desde el stem de bajo; la pista v6 ya tiene `source`);
  - `audio/guideRenderer.js`, `wavMixWorker.js` y `wavPcm.js`, porque cada guía es **un solo archivo pre-renderizado**;
  - en `server.js`: cancelar, progreso, limpieza de temporales y separador falso `STAGEPROMPTER_FAKE_SEPARATOR=1` para pruebas.
- **E4 · Cifrado.** Incluye:
  - `data/songEditing.js` y `data/history.js` (deshacer);
  - `ui/score/*`: pegar letra, tap de tiempos, anclar acordes, tonalidad por sección y "Declarar revisado".

  Se elimina `ui/calibrationEditor.js`.
- **E5a · Atril + audio guía.** Incluye:
  - `ui/perform/performanceView.js`, con perfiles Ensayo/Escenario;
  - `chartLayout.js` y `chartModel.js`;
  - el selector de guía;
  - `audio/metronome.js`;
  - pedal configurable, Wake Lock, pantalla completa y zonas táctiles.

  Se eliminan `playerView.js`, `stage/stageMode.js`, `autoScroll.js`, `songRenderer.js`, `chordTracker.js`, `videoSection.js`, `state/session.js` y `css/stage.css`.
- **E5b · Karaoke.** Incluye:
  - `audio/micService.js`, un único `getUserMedia`;
  - el inspector en vivo (afinador, radar, espectro y cotejo), con de a una vista. Usá `harmony/liveChordTracker.js` y `createChordVerifier`, que ya existen;
  - `data/practiceLog.js`.

  Se eliminan `audioDraftAssistant.js`, `performanceEvaluator.js` y `css/evaluator.css`.
- **E6 · Loopera.** Incluye:
  - `audio/arranger/arrangerEngine.js`, `transport/arrangerClock.js` y `ui/looper/*`;
  - `audio/recorder.js`, con latencia medida;
  - `audio/midiWriter.js` y exportación WAV.

  Espacio reproduce y R graba. Se eliminan `multitrackWorkspace.js` y `css/audio-draft.css`.
- **E7 (opcional) · Setlist mínima.**
- **E8 · Cierre.** Incluye:
  - limpieza de assets huérfanos con vista previa;
  - paquete de canción exportable/importable;
  - quitar `?ui=legacy`;
  - reescribir el manual y `docs/LABORATORIO-V2.md`;
  - tabla honesta de soportado / no soportado.

## 3. Reglas que no se negocian

**Decisiones fijas del usuario:**
1. **Una función = una sola experiencia.** Textual: "no tener dos cosas que hacen lo mismo; la más avanzada es la que debe quedar y sumar todas las funciones del otro". Nunca dejes dos editores, dos relojes, dos micrófonos ni dos detectores de acordes. Cuando una vista nueva reemplaza a una vieja, **borrá la vieja en esa misma etapa**, junto con sus pruebas, y actualizá las guardas.
2. **Mantener todas las funciones.** El Anexo C dice dónde vive cada función actual. Antes de borrar algo, verificá que su función ya existe en la vista nueva.
3. **Recorrido:** Biblioteca → Autopsia → Cifrado → Loopera → Karaoke → Atril. Una pantalla = un trabajo. Nada flotante salvo diálogos y popovers anclados al dock. Lo avanzado va detrás de un cajón.
4. **Karaoke y Atril son una sola vista con dos perfiles.** El modo de edición se llama **"Cifrado"**, no "Partitura".
5. **Acordes automáticos en el cifrado**, marcados como estimados.
6. **Velocidad:**
   - 0,5–1,25× sin cambio de tono en Autopsia, Cifrado y Karaoke;
   - Atril fijo en 1,0×;
   - en Loopera la velocidad cambia el tono y se rotula así.
7. **El contrato SongDocument v2 no cambia.** Cambiarlo invalida el hash de revisión (`data/reviewState.js`) y el validador estricto (`additionalProperties:false`).
8. **No se borra ningún store** (`labProjects`, `songs` v1) hasta después de E8.

**Técnicas:**
- **Stack:**
  - JavaScript vanilla con módulos ES, sin framework ni bundler en runtime;
  - **ningún CDN**: la app funciona sin conexión;
  - Essentia.js está vendorizado en `public/vendor/essentia/`.
- **Estilos:**
  - todo lo nuevo usa `tokens.css` y `components.css` (prefijo `sp-`, nada de colores sueltos);
  - texto mínimo de 12 px;
  - contraste AA;
  - sin scroll horizontal de página en móvil (gutter de 16 px);
  - la consulta de contenedor va en `.sp-app`.
  - Existe una regla global `[hidden]{display:none!important}` en la capa reset: no agregues parches por componente.
  - El navegador objetivo es Chrome o Edge actuales. Anchor positioning no se usa: los popovers se posicionan desde el rect del disparador. Si falta la Popover API hay un fallback manual.
- **Service worker:**
  - después de agregar o quitar archivos de `public/`, ejecutá `npm run build:shell`;
  - la prueba `tests/sw/shellManifest.test.js` falla si el manifiesto está desactualizado o si un import apunta a un archivo inexistente.
- **Armonía:** no reescribas el motor. Consumilo desde:
  - `harmony/harmonyTrack.js`: `buildHarmonyTrack`, `redecodeHarmony`, `applyUserEdit`, `regionsForSong`;
  - `harmony/analysisHarmony.js`;
  - `audio/analysisPipeline.js`.

  Si tocás algo del motor, `npm run eval:harmony` no puede retroceder.
- **Textos de la UI** en español rioplatense neutro, como en el prototipo. Código y comentarios en inglés, como el resto del repo.

## 4. Cómo trabajar

1. **Una etapa por vez.** Al empezar cada una, releé su sección del plan y listá los archivos que vas a crear, modificar y borrar.
2. **Pruebas primero en la lógica pura** (`node:test`, `npm test`). Hoy son 234 pruebas y todas pasan; no pueden bajar. Agregá guardas: "ningún import a archivos legacy ya eliminados".
3. **Verificación en navegador** en cada etapa, con un servidor propio en el **puerto 3100** (configuración `stageprompter-prueba` de `.claude/launch.json`). **No toques el servidor del usuario en el puerto 3000.** El origen 3100 tiene su propia IndexedDB, así que no afecta los datos del usuario. Límites conocidos del navegador integrado:
   - no registra service workers;
   - no concede micrófono;
   - suprime `alert/confirm`.

   Para probar sin eso:
   - inyectá archivos en los `<input type=file>` con `DataTransfer`;
   - generá audio de prueba con `harmony/synthProgression.js` (`renderProgression` + `encodeWav16`), que da audio sintético con respuesta conocida;
   - simulá el micrófono.

   El plan pide un runner e2e en `public/debug/e2e/`: base `sp-test-*`, SW apagado, audio sintético y micrófono simulado. Crealo en E2b y ampliá sus suites en cada etapa.
4. **Definición de terminado de cada etapa:**
   - `npm test` en verde;
   - `npm run build:shell -- --check` al día;
   - `npm run eval:harmony` sin retrocesos;
   - suite e2e verde;
   - cero errores de consola;
   - capturas en escritorio, tablet y móvil comparadas con el prototipo;
   - evidencia en `docs/rediseno/E<n>-EVIDENCIA.md`, con el mismo formato que E0/E1: qué se hizo, verificación y límites honestos.
5. **Un commit por etapa, al cerrarla.** Mensaje en español con el formato `E2a: …`. Terminá cada mensaje con:
   ```
   Co-Authored-By: <tu modelo> <noreply@anthropic.com>
   ```
   Nunca uses `--no-verify` ni reescribas la historia.
6. **Al cerrar cada etapa, pará** y reportale al usuario:
   - qué cambió y qué puede probar;
   - cómo probarlo;
   - qué limitaciones quedaron.

   Esperá su confirmación antes de la siguiente. El usuario controla el costo por etapas.
7. Si algo del plan resulta imposible o claramente peor en la práctica, **no lo cambies en silencio**: explicá el problema, proponé la alternativa y dejala escrita en la evidencia.
8. Mantené actualizado `MANUAL-INSTALACION-USO.md` en cada etapa que cambie cómo se usa la app.

## 5. Datos útiles

- **Arranque:** `npm start`, que usa `PORT` (3000 por defecto). La separación con Demucs es opcional y usa Python con `STAGEPROMPTER_PYTHON`.
- **IndexedDB** `StagePrompterDB` v3. Stores:
  - `songs` (v1);
  - `songsV2`;
  - `assets` (blobs);
  - `setlists`;
  - `settings`;
  - `labProjects`.

  Hoy el análisis vive dentro de `labProjects[].analysis`, con:
  - `harmony`: la pista v6 con cuadros cuantizados, `constraints` y `regions`;
  - `harmonicRegions`: vista de `harmony.regions`;
  - `chordCandidates`: evidencia por golpe;
  - `spectralFrames`, `beats` y `bpm`.

  En E2a eso se muda a `analyses`, y lo editable a `projects`.
- **Motor armónico:** `docs/rediseno/E1-EVIDENCIA.md` explica los presets, las restricciones y lo que queda para E3a/E3b (inspector, dividir/unir desde la línea de tiempo, stems como fuente, "aplicar a repeticiones").
- **Banco con canciones reales:** `public/debug/harmony-eval.html`.
- **Transporte único:** `public/js/transport/transport.js`, con adaptadores. El plan agrega `mediaClock` y `arrangerClock`.

Empezá por **E2a**. Primero leé los documentos de la sección 1 y respondé con tu plan concreto para E2a: archivos, pruebas y casos del Anexo B. Después implementalo.
