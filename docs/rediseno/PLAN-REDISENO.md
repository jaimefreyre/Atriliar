# Rediseño de StagePrompter: del audio al atril

## Contexto

**Pedido.** Gran parte de la app ya existe (C0–C12: contrato v2, motor musical, transporte, editor, prompter, evaluador de ritmo, borrador desde audio, laboratorio con autopsia, karaoke en vivo, multipista con Demucs, loopera, MIDI), pero quedó "encimada", con mala UX y funciones a medias. Se pide cambiar por completo cómo se usa, **manteniendo todas las funciones**, hacia un objetivo claro: ser un gran analizador de audio, extraer samples para la loopera y, como fin último, convertir **cualquier audio en un atril para tocarlo**, con audio guía en el escenario. Además, el reconocedor de armonías "cambia muchísimo o no detecta muchos cambios".

**Qué se relevó** (auditoría de solo lectura, rama `v2-laboratorio`, ~2.000 líneas sin commitear, `npm test` 170/170):
- El laboratorio es una sola página de 1.174 líneas (`public/js/ui/audioDraftAssistant.js`): 4 pestañas (Autopsia, Karaoke, Multipista, Loopera), reproductor fijo de ~230 px siempre visible, barra lateral con un segundo editor de secciones, 6 + 8 interruptores de paneles y dos botones de la misma barra que en realidad salen del laboratorio.
- Hay ≥ 7 transportes de audio y 3 flujos de micrófono independientes. El propio `transport/transport.js` tiene un error de anclaje con audio real (verificado: `seek()`/`play()` leen `adapter.now()` antes de reposicionar el audio; buscar durante la reproducción desfasa la posición y detener→reproducir queda atrasado).
- Dos mundos de datos: `labProjects` (análisis, stems, loop) y `songsV2` (cifrado). Se unen con una copia única con pérdidas que crea una canción nueva cada vez y solo copia los acordes elegidos a mano; las elecciones hechas en la vista por pulsos (la vista por defecto) nunca llegan.
- "Karaoke" no muestra letra: es un analizador de micrófono. La loopera duplica o silencia fragmentos, Espacio graba, no hay metrónomo ni compensación de latencia. La multipista guarda el análisis de cada stem solo en memoria. El reproductor solo puede usar la mezcla completa como guía y no tiene volumen, velocidad ni A–B.
- CSS: 5 lenguajes visuales, 422 colores, `audio-draft.css` de 76 KB con 11 capas de parches y 70 `!important`; textos de hasta 0,42 rem; 17 `alert/confirm` nativos.
- `sw.js` no precachea `music/chromaMatch.js`: sin conexión no carga la app entera.
- Reconocedor: dos salidas de acordes que se contradicen; 180 plantillas con duplicados de notas (C6 = Am7, Csus2 = Gsus4) sin modelo temporal (parpadeo) y umbrales duros que descartan cambios reales (omisiones); el "bajo" (tomado de picos de octava 3 a 4096 muestras) parte regiones; su precisión nunca se midió.

**Resultado buscado.** Un recorrido único por canción, una pantalla = un trabajo, un reloj, un micrófono, una pista armónica y un Atril que funciona con cualquier audio y guía elegible (mezcla, sin un instrumento, solo algunas pistas, clic o loopera).

## Diseño propuesto

### Recorrido del músico
**Biblioteca → Autopsia → Cifrado → Loopera → Karaoke → Atril**, siempre sobre una canción. Las pestañas no son prerequisitos: una canción importada sin audio entra directo a Cifrado o Atril.

### Arquitectura de información
- **Biblioteca** (inicio): una sola lista de canciones con estado (Borrador / Analizada / Cifrado revisado / Con pistas / N samples), búsqueda y filtros. Acción principal **"Nueva desde audio"** (soltar audio o video); secundarias: Importar (JSON, respaldo, v1), Canción vacía, Almacenamiento, Respaldo. Las canciones v1 van en un grupo con "Convertir".
- **Espacio de la canción** (`#/cancion/<id>/<modo>`; recargar conserva el lugar y la posición en pausa):
  - **Barra superior**: volver, título/artista, tonalidad · BPM · compás, estado de revisión y de guardado, pestañas de modo.
  - **Lienzo principal** (uno por modo) + **inspector** a la derecha (contextual, plegable) + **dock de transporte** abajo (play/pausa, posición, A–B, velocidad, guía, clic/cuenta, volumen; EQ en un popover).
- **Reglas anti-"encimado"**: ningún modo muestra paneles de otro; nada flotante salvo diálogos y popovers anclados al dock; lo avanzado (evidencia, radar, espectro) detrás de un cajón y de a una vista; carriles por defecto mínimos y "+ carril" para el resto; un solo mapa global de atajos con ayuda "?"; diálogos propios en lugar de `alert/confirm`; autoguardado con deshacer e indicador de guardado.

### Qué hay en cada modo
| Modo | Lienzo | Inspector y acciones |
|---|---|---|
| **Autopsia** (analizador + multipista) | Línea de tiempo alineada con minimapa y zoom. Carriles visibles: Secciones, **Acordes** (una sola pista armónica, fichas editables y accesibles), Pulsos/compases (downbeat y compás ajustables), Onda. Plegados: Pistas separadas (M/S por stem), Notas (bajo/medio/alto, MIDI), Espectro (croma/graves/agudos), Evidencia por pulso (solo lectura). | Acorde seleccionado: alternativas, confirmar, dividir, unir, mover límite, "aplicar a repeticiones", cajón de evidencia, diapasón/bajo/piano. Sensibilidad de cambios (Estable / Normal / Detallada). Fuentes: mezcla, video, stems, tomas; "Separar pistas" con progreso y cancelar. "Enviar selección a Loopera". "Actualizar cifrado". |
| **Cifrado** (editor único) | Secciones, líneas de letra con acordes anclados y tablatura por sección, alineadas al tiempo; vista de tabla para ajuste fino. | Metadatos (incluida la tonalidad por sección), pegar letra, tap para tiempos de línea y palabra, desfase global, audio principal, deshacer/rehacer, revisión ("N acordes sin confirmar", Declarar revisado). |
| **Loopera** | Banco de pads (samples capturados desde cualquier selección de Autopsia —mezcla o stem— o grabados) + el arreglador multipista existente. | Pad/clip: recorte, ganancia, modo loop/one-shot, cuantización; grabar capa con cuenta regresiva y latencia compensada; metrónomo; exportar WAV por sample o mezcla (sirve para looperas físicas); importar y exportar MIDI. |
| **Karaoke** (perfil Ensayo) | Prompter con letra y acordes, o cifrado por compases si el audio es instrumental. | Escucha en vivo, una vista a la vez: Afinador · Radar · Espectro · Cotejo ("¿estás tocando el acorde esperado?"). Evaluación de ritmo. A–B por sección, velocidad sin cambio de tono, guía. |
| **Atril** (perfil Escenario) | Lectura limpia a pantalla completa: letra+acordes o cifrado por compases con compás actual y pulso. | Mínimo: guía y volumen, siguiente sección, pantalla completa, Wake Lock, pedal/teclado configurable, banner de modulación, zonas táctiles, reloj y tiempo restante. |

Karaoke y Atril son **una sola vista con dos perfiles**, como ya pedía `docs/spec-v2/DISENO-UI.md` (Ensayo/Escenario): el prompter no se duplica.

### Sistema de diseño
Tokens CSS (`public/css/tokens.css`: color, espacio, tipografía, radios, escala de z-index) y componentes (`public/css/components.css`, prefijo `sp-`, sin selectores de elemento): botones, pestañas, carril, ficha de acorde, inspector, dock, pads, diálogos, avisos. Tema oscuro derivado de la paleta de escenario (`#020303`, línea activa amarilla, acordes cian), texto mínimo 12 px, un solo acento por vista, contraste AA verificado por prueba. Los colores de canvas/SVG salen de los tokens (`public/js/ui/theme.js`).

### Reemplazos intencionales (se aprueban con el plan)
Elegir acorde por pulso → evidencia por pulso de solo lectura (las decisiones van a la pista armónica única). Los 6 + 8 interruptores → carriles plegables y selector de vista. Superposición del micrófono sobre el mapa de Autopsia → vive en Karaoke. "Analizar mezcla" (no hacía nada) → se elimina. Auto-agregar todos los stems a la loopera y silenciar la mezcla → deja de ocurrir. Editor de secciones del laboratorio → absorbido por Cifrado. "Guardar laboratorio" → autoguardado con deshacer. Auto-scroll por BPM del escenario v1 → cifrado guiado por el reloj. Miniaturas de YouTube (red + `innerHTML`) → enlaces simples desde `song.sources`.

## Arquitectura técnica

### Una canción = un proyecto
- `songsV2` (SongDocument v2, portable) sigue siendo el cifrado y **el contrato no cambia**: cambiarlo invalidaría el hash de revisión (`data/reviewState.js`), rompería el validador estricto (`additionalProperties:false`) y los assets no son portables de todos modos.
- Store nuevo `projects` (clave `songId`, 1:1): fuentes (mezcla, stems, tomas, video, renders, desfases), grilla (bpm, compás, downbeat), armonía (versión del motor, sensibilidad, **ediciones del usuario como restricciones**), samples, sesión de loopera, guía elegida, práctica, estado de UI.
- Store nuevo `analyses` (por canción + fuente + versión de motor): features cuantizadas, pulsos, onsets, espectro reducido, regiones automáticas. Se escribe una vez por análisis, nunca en el autoguardado (hoy cada tecla reescribe varios MB, `audioDraftAssistant.js:323-357`).
- Los acordes del cifrado son una **proyección determinista** de la pista armónica (`data/chartSync.js`: ids estables `ch-<startMs>`, ancla a la palabra más cercana, `bassNote` en slash chords). Incluye los automáticos, marcados como estimados hasta confirmar; `timing.status` y `reviewWarnings` ("N acordes sin confirmar") mantienen la honestidad. Esto revierte a propósito la regla de C11 "solo acordes elegidos". Siempre se actualiza la misma canción: se acaban los duplicados.
- `labProjects` queda congelado tras migrar (Anexo B). Antes de subir la versión de la base se publica tolerancia a `VersionError`, para que un rollback no deje la app sin cargar.

### Un reloj, un micrófono
- `audio/engine.js`: un solo `AudioContext` (cadena maestra ganancia → EQ 3 bandas → limitador; buses de guía, clic, sintetizador y monitoreo; latencia de salida; temporizador en Worker para no frenarse en pestañas ocultas).
- `transport/transport.js` sigue siendo la única autoridad de posición, con adaptadores: **`mediaClock`** (un `<audio>`/`<video>` con `preservesPitch`, para Autopsia, Cifrado, Karaoke y Atril), clic generado, manual y, solo en Loopera, `arrangerClock` sobre el motor de buffers existente. Se agregan: velocidad durante la reproducción, bucle A–B, estado de cuenta regresiva y cambio de adaptador conservando la posición.
- **Guías pre-renderizadas** (`audio/guideService.js` + `audio/wavMixWorker.js`): cada opción (mezcla, un stem, "sin guitarra", "solo bajo y batería"…) se resuelve a un único archivo; las mezclas se renderizan una vez (Demucs entrega WAV PCM: se mezcla sin decodificar) y se cachean como asset. Suena un solo archivo, así que la sincronía entre stems es exacta y la memoria queda acotada (decodificar 6 stems + mezcla de 5 min ocuparía ≈ 800 MB).
- `audio/micService.js`: un único `getUserMedia` (procesamiento de voz apagado, dispositivo elegible, latencia medida por dispositivo) compartido por Karaoke, evaluación y grabación de la loopera; el worklet marca el tiempo con el `currentFrame` global.
- Política de velocidad (enmienda a `ESPECIFICACION.md` §5): 0,5–1,25× sin cambio de tono en Autopsia, Cifrado y Karaoke; Atril fijo en 1,0×; en Loopera la velocidad cambia el tono y se rotula así.

### Motor armónico v6 (detalle en Anexo A)
Línea Chordino (croma NNLS + HMM) con una sola salida:
1. **Frente de señal en JS puro**: espectro log-frecuencia, afinación global, blanqueo y NNLS reales → croma de agudos y **croma de bajo separada**, a 16384/2048 muestras. Medido en Node: `NNLSChroma(useNNLS=true)` del Essentia vendorizado devuelve ceros y `LogSpectrum` por cuadro tarda ~8 min por canción; se usan solo como oráculo en pruebas. (Es un port de código GPL/AGPL: se conserva la atribución; el repo ya distribuye Essentia.js AGPL.)
2. **Pasos por pulso**: mediana saltando el ataque; medio pulso si el pulso ≥ 450 ms; grilla fija de 250 ms si el ritmo no es confiable.
3. **Viterbi** sobre 25 estados (N + 12 mayores + 12 menores, sin duplicados) con duración mínima y **una sola perilla**: Sensibilidad de cambios (Estable / Normal / Detallada). Forward-backward da confianza y marca "cambio dudoso".
4. **Refinamiento por región**: 7, maj7, m7, 6, sus, dim, m7b5, aug y 5 solo si la nota se sostiene; gemelos de mismas notas como alternativas, nombrados por el bajo; slash chords si el bajo se sostiene (≥ 4 pulsos en Normal); **un bajo que camina o alterna nunca parte regiones**.
5. **Ediciones del usuario como restricciones**: cambiar la sensibilidad nunca pisa lo corregido.
6. **Con stems**: agudos desde bajo+otros(+guitarra+piano) y bajo desde el stem de bajo.
7. **En vivo**: filtro hacia adelante con histéresis, sin reinicios duros; si hay cifrado, **verifica el acorde esperado** ("coincide / falta G / suena como X").
8. **Banco de pruebas** (`npm run eval:harmony` + `node:test`): progresiones sintéticas con verdad conocida y canciones reales que anotes (cifrados revisados, sin salir de la máquina). Métricas: WCSR, **sobresegmentación ("cambia muchísimo") y subsegmentación ("no detecta cambios")**, F1 de límites y cambios por minuto. Primero se mide el motor actual; después umbrales mínimos que solo pueden subir.

## Camino funcional por etapas
Cada etapa deja la app usable, termina con commit y evidencia, y se puede pausar al cerrarla (control de costo). Tamaño relativo S / M / L.

**E0 — Estabilizar la base (S).** Commitear el trabajo pendiente en `v2-laboratorio`, etiquetarlo y abrir la rama `v3-rediseno`. Arreglar: anclaje del transporte con audio real (`transport.js:79-117`: llamar al adaptador antes de re-anclar; `stop()` reposiciona) con prueba de adaptador tipo media; `sw.js` con lista generada (`scripts/build-shell-manifest.cjs`), red primero para el shell propio e incluir `chromaMatch.js`; marca de tiempo del micrófono (`audio/audio-worklet-processor.js`, `audio/micCapture.js`); interruptor `checked` y Espacio = reproducir en Loopera (`audioDraftAssistant.js:207,213,1071`); grabación de loopera sin procesamiento de voz (`multitrackWorkspace.js:1236`); fuga del evaluador y Esc que cierra el reproductor (`performanceEvaluator.js`); `AudioContext` MIDI sin cerrar (`audioAnalysisVisualizer.js:1118`); revincular audio pisa el asset compartido (`calibrationEditor.js:242-264`); tolerancia a `VersionError` (`data/indexedDb.js`). *Cierre:* pruebas verdes, la app recarga sin conexión con el servidor detenido, buscar durante la reproducción es exacto.

**EP — Prototipo navegable (S–M).** `docs/rediseno/prototipo.html` autónomo con datos de la demo, sobre los `tokens.css`/`components.css` reales: biblioteca, los 5 modos y estados vacío / analizando / separando / sin micrófono / audio faltante. *Cierre:* lo aprobás antes de E2b (evita rehacer pantallas).

**E1 — Motor armónico v6 + banco de pruebas (L).** Anexo A. Primero se extrae `audio/analysisPipeline.js` sin cambiar comportamiento y se mide el motor actual; después frente NNLS, decodificador, refinamiento, pista armónica v6, migración de proyectos v5 (las elecciones por región **y por pulso** pasan a restricciones) y rastreador en vivo. Los consumidores actuales se adaptan lo mínimo (leen la pista única; "Resolución" pasa a "Sensibilidad") para que el laboratorio actual ya muestre el motor nuevo; la UI definitiva llega en E3a. *Cierre:* umbrales del Anexo A en verde y reporte comparativo viejo vs nuevo.

**E2a — Modelo unificado (M).** Stores `projects` y `analyses`; `data/projectRepo.js`, `data/projectModel.js`, `data/chartSync.js`, respaldo JSON v2 con proyectos (`data/backup.js`). En el primer salto a v4 se eliminan una sola vez los registros locales pre-v4, según la enmienda siguiente. *Cierre:* un proyecto nuevo se guarda y abre sin duplicados; el cifrado sincroniza sin solapamientos.

**Enmienda E2a solicitada por el usuario (2026-09-30):** no migrar ni importar registros anteriores. Al pasar a IndexedDB v4, limpiar una sola vez los datos locales pre-v4 y empezar con el modelo nuevo vacío; no generar respaldo previo de esos datos. Esta decisión reemplaza para E2a la migración y casos de Anexo B. Mantener el esquema SongDocument v2 y probar creación, guardado y sincronización de datos nuevos.

**E2b — Sistema de diseño, shell y biblioteca (L).** Tokens y componentes; `ui/components/dialogs.js` y avisos en lugar de `alert/confirm`; `ui/shell/{router,appShell,dock,inspectorHost,keymap,legacyHost}.js`; `ui/library/libraryView.js` con "Nueva desde audio", búsqueda, estados y panel de almacenamiento; `app.js` queda como arranque corto. Las vistas viejas se alojan dentro del shell (modo embebido, su CSS inyectado solo mientras están montadas) hasta ser reemplazadas; bandera `ui:shell` con `?ui=legacy` de escape hasta E8. *Cierre:* toda función existente alcanzable por una ruta; recargar conserva ruta y posición.

**E3a — Autopsia: línea de tiempo, acordes e inspector (L).** `audio/engine.js`, `transport/mediaClock.js`, `audio/analysisService.js` (progreso y cancelar), `ui/timeline/*` (onda, grilla con downbeat, secciones, acordes, evidencia), inspector de acorde, cajón de evidencia, `ui/components/instrumentPanel.js` (diapasón/bajo/piano/tab compartido; `rendering/chordDiagram.js` recibe la escala por parámetro), `audio/sampleCapture.js`. *Cierre:* audio sintético → cambios detectados → corregir/confirmar → "Actualizar cifrado" → cifrado válido.

**E3b — Autopsia multipista y guías (L).** Panel de fuentes (separar, importar stems, video), carriles de stems (M/S, mapa armónico, análisis persistido, "usar como fuente armónica"), carril de notas + sintetizador sobre el reloj común, carril de espectro, `audio/guideRenderer.js`, `wavMixWorker.js`, `wavPcm.js`. `server.js`: cancelar, progreso, limpieza de temporales, preset voz / sin voz, FLAC opcional y separador falso para pruebas. Se eliminan `ui/audioAnalysisVisualizer.js` y la parte de stems de `ui/multitrackWorkspace.js`. *Cierre:* con el separador falso, cambiar de guía (mezcla / solo / sin instrumento) conserva la posición ±150 ms.

**E4 — Cifrado (L).** `data/songEditing.js` (operaciones del editor actual + dividir/unir/mover/desfase), `data/history.js` (deshacer), `ui/score/*` (carriles de secciones, letra y tabs; pegar letra; tap de tiempos de línea y palabra; inspector con tonalidad por sección y revisión). Se elimina `ui/calibrationEditor.js`. *Cierre:* pegar letra → tap → anclar acorde → declarar revisado, con el documento siempre válido.

**E5a — Atril + audio guía (M–L).** `ui/perform/performanceView.js` (perfiles Ensayo/Escenario), `chartLayout.js` + `chartModel.js` (cifrado por compases para audio instrumental), selector de guía, `audio/metronome.js` (clic y cuenta regresiva), extras de escenario (modulación, zonas táctiles, reloj, progreso, referencias), teclas de pedal configurables (`stage/inputActions.js`). Se eliminan `ui/playerView.js`, `stage/stageMode.js`, `stage/autoScroll.js`, `rendering/songRenderer.js`, `rendering/chordTracker.js`, `ui/videoSection.js`, `state/session.js`, `css/stage.css` y `#stage-container`. *Cierre:* tocar una canción con guía "sin guitarra", pantalla completa y pedal, sin fugas al salir.

**E5b — Karaoke (M–L).** `audio/micService.js`, inspector en vivo (afinador, radar, espectro, cotejo con verificación del acorde esperado), evaluación de ritmo integrada, `data/practiceLog.js`. Se eliminan `ui/audioDraftAssistant.js`, `ui/performanceEvaluator.js` y `css/evaluator.css`. *Cierre:* con micrófono simulado, cotejo y ritmo responden a lo tocado y no a la pista.

**E6 — Loopera (L).** `audio/arranger/arrangerEngine.js` (extraído, reloj de `AudioContext`, corrección de arranques tardíos), `transport/arrangerClock.js`, `ui/looper/*` (pads, arreglador, inspector de clip), `audio/recorder.js` con latencia medida, `audio/midiWriter.js`, exportación WAV por sample. Arreglos: sin stems auto-agregados, cada sample en su pista, cuantización en arrastre/recorte/inspector/duplicado, Espacio = reproducir y R = grabar. Se eliminan `ui/multitrackWorkspace.js` y `css/audio-draft.css`. *Cierre:* capturar → pad → colocar → grabar capa → exportar.

**E7 — Lista de canciones mínima (S–M, opcional).** Sobre el store `setlists` existente: cola de canciones y "siguiente" en el Atril.

**E8 — Cierre (M).** Limpieza de assets huérfanos con vista previa, paquete de canción (cifrado + proyecto + audio) exportable e importable, quitar la caché de audio duplicada del SW, reescribir `MANUAL-INSTALACION-USO.md` y `docs/LABORATORIO-V2.md`, aceptación contra `ESPECIFICACION.md` §10 más los criterios nuevos y tabla honesta de soportado / no soportado.

**Dependencias.** E0 primero. EP, E1 y E2a pueden ir en cualquier orden entre sí. Después: E2a → E2b → E3a → (E3b, E4) → E5a → E5b → E6 → E7 → E8. Reordenamientos válidos: E3b después de E5a (el Atril sale con mezcla y clic; las guías por stem llegan después) y E6 antes de E5b si la loopera es prioridad.

## Decisiones incluidas en el plan (se pueden vetar al aprobar)
1. Velocidad sin cambio de tono en estudio y Atril fijo en 1,0× (enmienda a spec §5).
2. Acordes automáticos en el cifrado, marcados como estimados (revierte la regla de C11).
3. Karaoke y Atril como una vista con dos perfiles; Atril antes que Loopera.
4. El modo de edición se llama **Cifrado** (no "Partitura": no hay pentagrama).
5. Lista de canciones mínima como etapa opcional. Uso en tablet por red local queda fuera por ahora: el servidor solo escucha en `localhost` y, por HTTP en red, el navegador no habilita micrófono, service worker ni Wake Lock.
6. Stems en FLAC si la versión de Demucs lo admite; panel de almacenamiento con tamaños por canción.
7. Los reemplazos intencionales listados arriba.
8. E0 commitea el trabajo pendiente en `v2-laboratorio` como base y abre `v3-rediseno`.

## Verificación
- `npm test` (node:test, lógica pura) en cada etapa, con guardas nuevas: manifiesto del SW completo (evita otro caso `chromaMatch.js`), contraste AA de tokens, ningún import a archivos legacy ya eliminados.
- `npm run eval:harmony` (Node carga el mismo Essentia vendorizado con shims de `require`/`__dirname`) y `public/debug/harmony-eval.html` para canciones reales anotadas.
- Pruebas de integración del servidor con separador falso (`STAGEPROMPTER_FAKE_SEPARATOR=1`).
- Runner e2e en página (`public/debug/e2e/`): base de prueba `sp-test-*`, SW apagado, audio sintético generado en la página, archivos soltados por `DataTransfer`, micrófono simulado. Se ejecuta con el navegador integrado: `preview_start "stageprompter"` → `/debug/e2e/?suite=…` → clic en Ejecutar → leer resultados y errores de consola.
- Definición de terminado por etapa: pruebas verdes, suite e2e verde, cero errores de consola, capturas en escritorio/tablet/móvil y evidencia en `docs/rediseno/E<n>-EVIDENCIA.md`.

## Límites honestos a mostrar en la UI
- Acordes estimados desde el contenido armónico: voz, solos y percusión densa confunden; tus correcciones nunca se reemplazan.
- Vocabulario automático: mayores y menores; 7, maj7, m7, 6, m6, sus2/sus4, dim, m7b5, aug y 5 solo si la nota se sostiene. No detecta 9/11/13 ni cambios de menos de un pulso (medio pulso en Detallada).
- Los límites caen en el pulso más cercano: si el tempo detectado está mal, también los límites.
- El bajo solo crea un tramo si se sostiene; acordes con las mismas notas (C6 = Am7) se nombran por el bajo.
- En vivo: 0,3–0,5 s de latencia; conviene usar auriculares para no puntuar la pista que suena; una nota cantada no define un acorde.
- Separación de pistas: deja filtraciones; mejora el bajo, pero no es infalible.

---

## Anexo A — Motor armónico v6

**Frente de señal** (`public/js/harmony/fft.js`, `nnlsChroma.js`, `chromaFrontEnd.js`): 44,1 kHz; Hann; FFT 16384, salto 2048 (46,4 ms); kernel log-frecuencia MIDI 20–105 a 3 bins/semitono (256 bins, disperso); fasor de afinación → corrección fraccional; blanqueo (Hamming 19, `x' = max(0, x−μ)/σ^w`); diccionario de 84 notas × 20 armónicos (amplitud 0,7^(h−1)); NNLS por descenso coordenado (arranque en caliente, ≤ 40 barridos, tolerancia 1e-4); ventanas de agudos y de bajo (bajo A0–A3) → croma 12 + 12 con base C; RMS por salto para `silenceGate.js`. Validación contra Essentia (`LogSpectrum`, `NNLSChroma(useNNLS=false)`) en el eval de Node. En vivo: ventana 8192, salto 2048, a la frecuencia nativa del contexto (sin el remuestreo actual).

**Grilla** (`harmonySteps.js`): pulsos de `audio/beatGrid.js`; 2 pasos por pulso si el pulso ≥ 450 ms; grilla fija de 250 ms si la confianza de ritmo < 1,2 o los pulsos cubren < 60 %; cuadros con centro en `[inicio + min(90, 0,2·L), fin − min(60, 0,15·L)]`, mediana por bin; fracción silenciosa por paso.

**Decodificador** (`chordDecoder.js`): 25 familias (N + 12 mayores + 12 menores); duración mínima por expansión de estados; emisión = coseno de croma comprimida (raíz cuadrada) contra plantilla (raíz 1, tercera 1, quinta 0,8) con κ ≈ 14, más término de bajo ponderado por su confiabilidad; N favorecido en texturas finas; silencio ≥ 65 % fuerza N; cambiar de acorde cuesta λ; prior de tonalidad Krumhansl–Kessler opcional (`keyProfile.js`).

| Parámetro | Estable | Normal | Detallada |
|---|---|---|---|
| Costo de cambio λ (nats) | 8,0 | 5,5 | 3,5 |
| Duración mínima | 1 compás (≥ 1,5 s) | 2 pulsos (≥ 0,7 s) | 1 pulso (≥ 0,25 s) |
| Costo hacia/desde N · mínimo | 4,0 · 2 pulsos | 2,75 · 1 | 1,75 · 1 |
| Prior de tonalidad ρ | 0,5 | 0,25 | 0 |
| Colores (7, maj7…) | uno por región | cambio 5,0 · sostén 4 pulsos | 3,5 · 2 pulsos |
| Presencia mínima del color | 70 % de pasos | 60 % | 50 % |
| Slash por bajo sostenido | nunca | ≥ 4 pulsos | ≥ 2 pulsos |

Valores iniciales: se calibran con el banco (κ ∈ {8, 11, 14, 18} × λ) y se congelan en `HARMONY_PRESETS` con enlace al reporte. Redecodificar al cambiar sensibilidad < 30 ms.

**Refinamiento** (`chordRefinement.js`, `chordVocabulary.js`): variantes por familia (mayor: 7, maj7, 6, sus4, sus2, add9, aug, 5; menor: m7, m6, dim, m7b5, dim7, sus4, sus2, 5), aceptadas si la nota distintiva tiene presencia ≥ 0,30 en la fracción de pasos del preset (y la nota reemplazada ≤ 0,2 en sus/5/dim/aug); gemelos de mismas notas solo como alternativas "mismas notas"; slash si la confiabilidad del bajo ≥ 0,4 y el bajo mayoritario ≥ 45 % y ≥ 1,5× el segundo (si es ajeno al acorde, ≥ 60 %); ortografía según la tonalidad estimada.

**Salida** (`harmonyTrack.js`, `analysis.harmony` versión 6): `{version, engine:'nnls-hmm-1', frontEnd, source (mix|stems), frames (cuantizadas, ~200 KB por 5 min), grid, key, sensitivity, constraints[], regions[]}`. Cada región: `id h-<startMs>, startMs, endMs, state (harmony|silence|no-chord), symbol, autoSymbol, root, quality, bassPitchClass, source (auto|user), confirmed, confidence, qualityConfidence, bassConfidence, boundaryStrength, alternatives[{symbol, score, reason: otra-raiz|color|mismas-notas|bajo}], chroma, bassChroma, evidence`. Editar la etiqueta es inmediato y agrega una restricción; dividir/unir redecodifica localmente con restricciones; cambiar la sensibilidad redecodifica todo respetando las restricciones.

**Migración v5 → v6**: restricciones desde `harmonicRegions[].selectedSymbol` y desde `chordCandidates[].selectedSymbol` (recupera las elecciones por pulso que hoy se pierden); decodificación provisional desde la croma guardada; se ofrece "Reanalizar con el motor nuevo (tus acordes se conservan)".

**En vivo** (`liveChordTracker.js`, `audio/frameClock.js`): filtro hacia adelante sobre los 25 estados, `p_cambio = 1 − e^(−Δt/τ)`, sin reinicios; cuadros de señal baja solo transicionan.

| | τ | Umbral de entrada | Sostén |
|---|---|---|---|
| Estable | 1,5 s | 0,75 | 250 ms |
| Normal | 0,8 s | 0,65 | 150 ms |
| Detallada | 0,4 s | 0,55 | 80 ms |

Verificación con cifrado: esperado = regiones en `[p − 200, p + 150]` ms (p con latencia compensada); "coincide" si la evidencia V ≥ +1 durante ≥ 200 ms; "parcial" si está la tríada pero falta un color o tono; "no coincide" si V ≤ −1 durante ≥ 300 ms ("suena como X").

**Métricas y umbrales iniciales** (`harmonyMetrics.js`, `synthProgression.js`; preset Normal, pulsos oráculo; luego trinquete contra la línea base guardada): limpio WCSR mayor/menor ≥ 0,92 y F1 de límites ≥ 0,90; con melodía o batería ≥ 0,85 y ≤ 2 cambios espurios/min; bajo caminante: cambios/min ≤ 1,1× la referencia y sobresegmentación ≥ 0,95; pedal: recall ≥ 0,90; desafinado ±30–40 cents: limpio − 0,02; colores (séptimas) ≥ 0,80; bajo descendente con inversiones ≥ 0,75; silencio: N ≥ 95 % del tiempo silencioso. Fixtures: pop de 4 acordes, cambios de 1 pulso, pedal, bajo caminante, bajo descendente, colores, silencios, desafinado, melodía encima, intro de batería, rubato, power chords, anticipaciones, demo.

**Rendimiento**: ~30 s para 5 min en un Worker (hoy ~21 s): ritmo ~13 s, frente JS ~10 s; objetivo ≤ 40 s, techo 90 s, progreso cada 5 %.

**Archivos**: nuevos en `public/js/harmony/` (`fft`, `nnlsChroma`, `chromaFrontEnd`, `harmonySteps`, `chordVocabulary`, `chordDecoder`, `chordRefinement`, `keyProfile`, `harmonyTrack`, `liveChordTracker`, `harmonyMetrics`, `synthProgression`), `audio/analysisPipeline.js`, `audio/frameClock.js`, `scripts/lib/loadEssentiaNode.mjs`, `scripts/eval-harmony.mjs`, `public/debug/harmony-eval.html`. Se reescriben `audio/essentiaAnalysisWorker.js`, `liveHarmonyWorker.js`, `audio-worklet-processor.js`, `onsetWorker.js`, `micCapture.js`. Se eliminan `audio/harmonicSegmentation.js`, `liveChordStabilizer.js`, `beatHarmony.js` (lógica portada) y `matchChordTemplate`/`CHORD_FINGERPRINTS` (se conservan las utilidades de octavas y `MIDI_NOTE_FINGERPRINTS`). La prueba "una inversión sostenida parte la región aunque el acorde sea el mismo" cambia de sentido.

## Anexo B — Reinicio local de datos (E2a)

En la primera apertura que actualiza una base anterior a v4, IndexedDB vacía sus registros existentes en la misma transacción de actualización y crea los stores del modelo vigente. No hay migración, importación automática ni respaldo de los registros anteriores. Después de iniciar, los proyectos, análisis y canciones nuevos se guardan con el modelo actual. El contenido de un archivo que el usuario importe explícitamente es una importación nueva, no una recuperación de la base local antigua.

## Anexo C — Dónde queda cada función actual
- **Autopsia**: video como fuente; EQ 3 bandas y velocidad (popover "Sonido" del dock); reproducir tramo o sección (Enter o clic en el carril); título/artista/BPM (barra superior) y BPM/compás/downbeat (carril de grilla); análisis con progreso y avisos; vistas croma/graves/agudos (carril Espectro); agrupar pulsos (compás del proyecto); evidencia, croma vs plantilla y picos (cajón); selector de acordes y catálogo manual (ficha); guitarra con picos, bajo, piano, tab y escala (panel de instrumento); notas MIDI manuales (carril Notas + diapasón); sintetizador de líneas MIDI (carril Notas, sobre el reloj común); círculo de quintas (inspector) y recorrido armónico (carril Notas); modelo 4/6 stems y guía de instalación (diálogo Separar); importar stems (Fuentes); reproductor, mapa armónico y análisis por stem (carriles de stem); notas de stem a MIDI, tramo original y desde/hasta numérico (acciones de la selección).
- **Karaoke**: métricas de cotejo con tendencia, afinador, espectro y radar (vistas de a una); estado y calidad del micrófono (chip).
- **Loopera**: A/B = cursor, preajustes 30 s / 1 min, BPM/cuantización/zoom, master con compresor, velocidad, grabación por vuelta o libre con medidor y nombre de toma, importar MIDI multipista, MIDI desde el análisis, 4 timbres, inspector de clip (edición numérica, duplicar, cortar, quitar), manijas de recorte, arrastre entre pistas, regla, exportación con límite de 20 min.
- **Karaoke/Atril**: acorde a estudiar e "Ir a este acorde", raíz/escala/capas del diapasón, tab según el tiempo, clic de respaldo con aviso, pantalla completa/Wake Lock, transponer y tamaño de letra, resaltado de palabras según el perfil.
- **Cifrado**: metadatos (tonalidad y compás), operaciones de estructura con desplazamiento, marcar inicio/fin, ms numéricos, desplazar selección ±ms, acordes sin anclar, vincular audio con verificación de duración y desfase, guardar con validación, Declarar revisado, avisos de revisión. A–B, volumen y silencio pasan al dock.
- **Biblioteca**: canciones v1 con migración, importar respaldo v1/v2, estado de almacenamiento, aviso de base bloqueada (banner).
- **Del escenario v1 hoy inalcanzable**: zonas táctiles, clic en un acorde para ver su diagrama, progreso "sección · acorde n/N", banner de modulación → Atril (la tonalidad por sección se edita en Cifrado).
- Se mantienen `/health` y `public/debug/*`.
