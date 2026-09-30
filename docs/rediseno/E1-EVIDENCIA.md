# E1 — Motor armónico v6 y banco de pruebas

Estado: **cerrada**. Todos los umbrales del Anexo A están en verde con el preset Normal. La UI definitiva de acordes llega en E3a; acá los consumidores actuales se adaptaron lo mínimo.

## Qué se hizo

- **Una sola respuesta de acordes.** Antes había dos salidas que se contradecían: regiones v5 y una plantilla por golpe. Ahora hay una pista armónica v6 (`public/js/harmony/`), y todo lo demás es una vista de ella:
  - **Frente de señal en JS.** Espectro log-frecuencia a 3 bins por semitono, afinación global, blanqueo, NNLS y croma de agudos y de bajo, a 16384/2048 muestras.
  - **Pasos por pulso**, o por medio pulso si el pulso dura ≥ 450 ms, con grilla fija de 250 ms si el ritmo no es confiable.
  - **Viterbi sobre 25 familias** (N + 12 mayores + 12 menores), con duración mínima y una sola perilla: *Sensibilidad de cambios* (Estable / Normal / Detallada).
  - **Refinamiento por región.** Los colores solo aparecen si la nota se sostiene. El slash se escribe solo con un bajo sostenido. Un bajo caminante no parte la región. Un color que vive solo en el bajo se escribe tríada/bajo (Am/G, no Am7/G).
- **Las decisiones del músico son restricciones.**
  - Elegir, confirmar, borrar, dividir y unir redecodifican desde los cuadros guardados (< 30 ms).
  - Cambiar la sensibilidad nunca pisa lo corregido.
  - **Dividir** marca un límite: ahí cambiar es gratis y la región se corta, pero no se inventa un acorde si el audio no cambia. Si cambia, lo encuentra (G | G7).
  - **Confirmar** acepta la respuesta del motor, no una corrección anterior.
- **Análisis.** `audio/analysisPipeline.js` concentra el análisis: ritmo con Essentia, pista v6, picos para el espectrograma y evidencia por golpe. El Worker quedó como adaptador fino, con progreso cada 5 %. El mismo código corre en Node para el banco.
- **Laboratorio actual.**
  - "Resolución" pasó a ser **Sensibilidad de cambios**.
  - La vista por golpe es **evidencia de solo lectura**, y cada golpe muestra el acorde de la pista.
  - Elegir un acorde pasa por la pista.
  - "Crear canción" ahora lleva **todos los acordes**: los automáticos quedan marcados como estimados, con el aviso "N de M acordes son estimados…", y los slash llevan su `bassNote`. Es la decisión 2 del plan.
- **Migración v5 → v6.** Al abrir un laboratorio viejo:
  - las elecciones por región **y por golpe** (antes se perdían) pasan a restricciones;
  - se decodifica en forma provisoria desde la croma guardada;
  - un aviso ofrece reanalizar, y al reanalizar se conservan las elecciones y la sensibilidad.
- **En vivo.**
  - `liveHarmonyWorker` calcula la misma croma NNLS a la frecuencia nativa del contexto, sin remuestrear, con ventana de 8192 y salto de 2048. Afinador y espectro siguen con Essentia.
  - `harmony/liveChordTracker.js` es un filtro hacia adelante sobre las 25 familias, con histéresis, sin reinicios duros y con histéresis propia para el color.
  - `createChordVerifier` responde "¿estás tocando el acorde esperado?": coincide / parcial (falta X) / no coincide (suena como X). Reemplaza la línea "Energía captada dentro de…".
  - `audio/frameClock.js` descuenta la latencia de entrada que informa la pista y respeta la velocidad al ubicar lo escuchado en la canción.
- **Se eliminó lo reemplazado:**
  - `audio/harmonicSegmentation.js`, `audio/liveChordStabilizer.js` y `audio/beatHarmony.js`;
  - `music/chromaMatch.js`;
  - `matchChordTemplate` y `CHORD_FINGERPRINTS`;
  - `summarizeSilenceWindow`.
  - Se conservan las utilidades de octavas y `MIDI_NOTE_FINGERPRINTS`.
- **Banco de pruebas:**
  - `npm run eval:harmony`: 15 progresiones sintéticas con respuesta conocida y trinquete contra `tests/harmony/harmony-baseline.json`;
  - `--engines essentia-cdb`: ChordsDetectionBeats de Essentia como referencia neutral;
  - `--oracle`: el frente de señal contra Essentia;
  - `public/debug/harmony-eval.html`: canciones reales de tu biblioteca o un audio con anotación `.lab` (formato MIREX/Harte), sin salir del equipo.

## Antes y después

Preset Normal, 15 fixtures, pulsos conocidos. Detalle en `E1-comparacion-motores.json`.

Las columnas "sobre" y "sub" son 1 − la distancia de Hamming direccional:
- "sobre" es la sobresegmentación, o sea "cambia muchísimo";
- "sub" es la subsegmentación, o sea "no detecta cambios".

En las dos, 1 es perfecto. Las salidas por golpe se leyeron con las repeticiones unidas, que es la lectura más favorable para ellas.

| Motor | Mayor/menor | Séptimas | Sobre | Sub | F1 límites | Silencio | Cambios/min vs referencia |
|---|---|---|---|---|---|---|---|
| **v6 (nuevo)** | **0,997** | **0,993** | **0,997** | **0,993** | **0,997** | **1,000** | **0,99×** |
| Anterior · regiones v5 | 0,865 | 0,396 | 0,947 | 0,958 | 0,819 | 0,538 | 1,12× |
| Anterior · por golpe (vista por defecto) | 0,896 | 0,584 | 0,805 | 0,985 | 0,736 | 0,500 | 2,67× |
| Essentia ChordsDetectionBeats | 0,937 | 0,874 | 0,929 | 0,966 | 0,808 | 0,000 | 1,35× |

Casos que explican la queja:

| Caso | v6 | Motor anterior |
|---|---|---|
| **Melodía sobre C** | 6 cambios/min (referencia 6) | Por golpe: 93 cambios/min, alternando C / Cmaj7 / C6 |
| **Intro solo de batería** | Silencio correcto | Inventa Dmaj7, Fm7b5, G#dim7… (silencio reconocido 0–17 %) |
| **Bajo caminante** | No parte el acorde | Regiones v5 lo parten al doble |
| **Séptimas donde no hay** | No las pone | Pone Cmaj7 o Am7 en lugar de C o Am en la mitad del tiempo (séptimas 0,25–0,49 en pop4 y la demo) |

Umbrales del Anexo A con Normal: todos en verde, porque `npm run eval:harmony` sale sin fallas.

- Limpio: mayor/menor ≥ 0,92 y F1 ≥ 0,90.
- Con melodía o batería: ≥ 0,85 y ≤ 2 cambios espurios por minuto.
- Bajo caminante: sobresegmentación ≥ 0,95 y ≤ 1,1× los cambios de la referencia.
- Pedal: recall de límites ≥ 0,90.
- Desafinado ±30–40 cents: ≥ 0,90.
- Séptimas: ≥ 0,80.
- Inversiones: ≥ 0,75.
- Silencio: ≥ 0,90.

## Calibración (valores congelados)

- **κ = 14.** Todo κ entre 11 y 18 da el mismo resultado. Con κ = 8 falla el pedal (mayor/menor 0,44).
- **Estable, costo de cambio 8 → 6,5.** Con 8 se tragaba un compás de Fmaj7 entre dos Am. El mínimo de un compás ya lo mantiene estable.
- **Color ausente (nuevo): 1,5 por paso.** Es el costo que paga una variante en cada paso donde falta su nota distintiva, y es el gemelo de la prueba de "nota sostenida". Sin él, la fuga de B hacía que un maj7 se tragara el compás de C anterior y todo el tramo terminaba como tríada: el cliché C–Cmaj7–C7–C6 perdía el Cmaj7.
- **En vivo.**
  - Cada cuadro cuenta como su parte de un pulso nominal de 300 ms.
  - El color se juzga sobre 2 × `colorHoldMs` (Estable 1200 / Normal 800 / Detallada 500 ms) y se congela mientras otra familia está entrando.
  - La nota dominante del bajo cuenta la mitad al juzgar el color.
  - Latencia para mostrar un cambio (audio sintético a 48 kHz):
    | Preset | Latencia |
    |---|---|
    | Normal | 0,31–0,64 s |
    | Detallada | 0,22–0,48 s |
    | Estable | 0,43–0,81 s |
  - En Normal no hay parpadeo en pop4, melodía, bajo caminante, pedal, batería ni cambios rápidos. En Detallada, un bajo caminante todavía puede mover el color (C → Cmaj7) mientras pasa por B.
- **Silencio.** Se mide sobre silencios de ≥ 400 ms. La cola de release de unos cientos de ms todavía suena como el último acorde.

## Rendimiento

- **Frente de señal:** ~12 ms por segundo de audio en Node.
- **Análisis completo con Essentia:**
  | Dónde | Audio | Tiempo |
  |---|---|---|
  | Node | 32 s | 2,8 s |
  | Navegador (Worker real) | 28 s | 2,9 s |
  | Estimado | 5 min | ≈ 30 s (objetivo del plan ≤ 40 s) |
- **Redecodificar** al cambiar la sensibilidad: < 30 ms.
- **En vivo:** 0,3–0,5 ms por cuadro.
- **Oráculo:** la croma sin NNLS coincide con `LogSpectrum` + `NNLSChroma(useNNLS=false)` de Essentia (coseno mediana 0,998, p10 0,998, mínimo 0,985) y es ~240× más rápida (0,21 s contra 51,5 s).

## Verificación

- **`npm test`:** 234/234. Pruebas nuevas:
  - decodificador sobre emisiones de juguete: duración mínima, costo de cambio, límite libre, `noChange`, `relaxed` y posteriores;
  - refinamiento: cliché, séptima que se filtra, slash sostenido contra bajo caminante, Am/G;
  - pista y ediciones: elegir, confirmar, confirmar después de corregir, borrar, dividir con y sin cambio real, unir, y sobrevivir al cambio de sensibilidad;
  - las 9 fixtures rápidas contra sus umbrales;
  - migración v5 → v6;
  - pipeline completo con el Essentia vendorizado;
  - rastreador en vivo con audio real a 48 kHz y el cotejo;
  - reloj de cuadros;
  - formato `.lab` y borrador con `bassNote` y estimados.
- **`npm run eval:harmony`:** sin retrocesos contra la línea base.
- **Navegador integrado, servidor propio en el puerto 3100:**
  - **Banco `harmony-eval.html`:**
    - canción sintética con melodía y batería inyectada por `DataTransfer`: 96 BPM detectados, Normal con F1 1,000 y ninguna sobresegmentación;
    - la única diferencia es Am/G contra C6/G, que son las mismas notas.
  - **Laboratorio:**
    - analizar da exactamente C · G · Am · F · Am · Am/G · F · G · G7 · C;
    - Estable une Am+Am/G y G+G7;
    - elegir G7 se mantiene en Detallada;
    - la evidencia por golpe es de solo lectura;
    - "Crear canción editable" da un cifrado **válido** con los 10 acordes (1 confirmado y 9 estimados), `Am/G` con `bassNote: G` y el aviso de estimados;
    - no hubo errores de consola.
  - **Migración:**
    - un laboratorio guardado en formato v5, con una elección por región y dos por golpe, se abrió con las dos restricciones marcadas ✓ y el aviso para reanalizar;
    - al reanalizar pasó a `nnls-js`, conservó las elecciones y el aviso desapareció.
  - **Prototipo EP:** la regla global `[hidden]` agregada al sistema de diseño no cambió nada.

## Límites y pendientes

- **Música real.** El banco sintético está casi saturado: las cifras reales dependen de canciones reales. `harmony-eval.html` está listo para medirlas con tus cifrados revisados o con anotaciones `.lab`.
- **Gemelos de mismas notas.** Casos como Am/G y C6/G se deciden por el bajo, y el otro queda como alternativa "mismas notas".
- **En vivo no hay slash.** Una ventana de 8192 muestras no resuelve bien los bajos graves: Am/G se muestra como Am7, que son las mismas notas. El cotejo compara por familia y tonos, así que igual da "coincide".
- **No se probó con micrófono real.** El navegador integrado no concede el permiso. Las latencias salen de audio sintético y falta repetirlas con un micrófono en Chrome o Edge.
- **NNLS de Essentia.** `NNLSChroma(useNNLS=true)` del Essentia vendorizado devuelve ceros, así que el oráculo valida el camino sin NNLS. El paso NNLS propio se valida con verdades sintéticas: atenúa el armónico fantasma de una nota sola y separa el bajo en un Am/G.
- **Stems como fuente armónica** (agudos desde la mezcla sin voz, bajo desde el stem de bajo): llega con los carriles de stems en E3b. La pista ya guarda `source`.
- **UI definitiva.** Inspector de acorde, dividir/unir desde la línea de tiempo, "aplicar a repeticiones" y cajón de evidencia llegan en E3a. El laboratorio actual sigue con su diseño viejo.
