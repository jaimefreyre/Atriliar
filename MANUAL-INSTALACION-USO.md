# StagePrompter — manual de instalación y uso

Este manual describe la versión local del **Laboratorio del sonido**: requisitos, instalación, arranque, herramientas, almacenamiento y límites conocidos. Está escrito a partir del código presente en este proyecto.

## 1. Qué es la aplicación

StagePrompter es una aplicación web local para estudiar una canción, relacionar lo que se oye con posibles notas y acordes, escribir una versión editable y ensayarla. El navegador ejecuta la interfaz y el análisis musical normal. Node.js sirve la aplicación y ofrece una API local para la separación de fuentes. Python y Demucs son opcionales y se usan solo al separar una mezcla.

No es un servicio en la nube: al separar, el navegador envía el audio al servidor Node que corre en esta misma computadora, y ese servidor ejecuta Demucs localmente. El navegador conserva los proyectos y medios en IndexedDB.

Desde IndexedDB v4, cada canción tiene un proyecto local asociado y sus análisis se guardan aparte por origen y versión del motor. La primera apertura de esta versión limpia los registros locales anteriores de StagePrompter; no importa ni convierte análisis guardados por versiones previas.

## 2. Requisitos

### Básicos

- Windows, macOS o Linux de 64 bits.
- Para una instalación nueva, usa Node.js 22 o 24 LTS. Esta copia se probó con Node 20.17.0 y npm 11.12.1; Node 20 llegó al fin de soporte en marzo de 2026. Consulta las [versiones mantenidas de Node.js](https://nodejs.org/en/about/previous-releases).
- Un navegador moderno, por ejemplo Chrome o Edge. Se necesita IndexedDB, Web Audio y JavaScript Modules.
- Espacio de disco para el proyecto, los archivos de audio y los pesos del modelo Demucs. La primera separación descarga el modelo por Internet.

### Opcionales para separar pistas con IA

- Python de 64 bits. Se probó con Python 3.12.10.
- PyTorch y TorchAudio.
- Demucs y SoundFile.
- Una CPU compatible. La separación funciona en CPU; puede tardar más que la duración de la canción. La aceleración por GPU requiere instalar una versión de PyTorch apropiada para esa GPU.

Python no es necesario para abrir el laboratorio, analizar una mezcla en el navegador, usar el afinador en vivo, escribir canciones o usar la Loopera. Sin Python/Demucs, la separación local queda deshabilitada; todavía se pueden importar pistas separadas que ya existan.

## 3. Instalar en Windows

Abre PowerShell en la carpeta del proyecto:

~~~powershell
Set-Location 'C:\Users\Emiceli\OpenCode\PromptGuitarraAcordes'
npm ci
~~~

Para aislar las dependencias de Python en este proyecto, crea un entorno virtual e instala PyTorch para CPU y luego Demucs:

~~~powershell
py -3.12 -m venv .venv-separation
.\.venv-separation\Scripts\python.exe -m pip install --upgrade pip
.\.venv-separation\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.\.venv-separation\Scripts\python.exe -m pip install demucs SoundFile
~~~

Si el lanzador py no está instalado, usa python en el primer comando. Para instalar PyTorch con CUDA u otra plataforma, elige la combinación adecuada en el [selector oficial de PyTorch](https://pytorch.org/get-started/locally/).

## 4. Arrancar y detener

En la misma ventana de PowerShell:

~~~powershell
$env:PORT = '3000'
$env:STAGEPROMPTER_PYTHON = (Resolve-Path .\.venv-separation\Scripts\python.exe).Path
npm start
~~~

La terminal debe permanecer abierta mientras uses la app. Abre [http://localhost:3000](http://localhost:3000). Para detener el servidor, vuelve a esa terminal y pulsa Ctrl+C. Para cambiar el puerto, cambia PORT antes de npm start.

En macOS/Linux, el comando para activar el entorno virtual es normalmente source .venv-separation/bin/activate; define PORT y STAGEPROMPTER_PYTHON con la ruta a ese Python y ejecuta npm start. Instala PyTorch según el sistema operativo y hardware usando el selector oficial.

Al abrir la raíz (`http://localhost:3000/`) se muestra el shell nuevo E2b: biblioteca, navegación del proyecto e inspector. El laboratorio anterior vive temporalmente en `legacy.html` y se carga dentro del shell al abrir una vista; se irá sustituyendo en las etapas E3–E6. Para comparar puntualmente con la pantalla anterior se puede abrir `http://localhost:3000/?ui=legacy`.

### Comprobación rápida

En otra terminal de PowerShell:

~~~powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/api/separation/status
~~~

La primera respuesta debe indicar estado ok. Si Python y Demucs están disponibles, la segunda debe incluir available: true y “Demucs listo para separar en este equipo”.

Desde la carpeta del proyecto también puedes validar el código:

~~~powershell
npm test               # suite completa (≈ 10 s)
npm run eval:harmony   # banco del reconocedor de acordes contra su línea base (≈ 1 min)
~~~

Ambos deben terminar sin fallas. El segundo imprime, por progresión y por sensibilidad, los aciertos y cuánto "cambia de más" o "no detecta" el motor (ver sección 7).

## 5. Recorrido inicial

1. Abre la raíz del proyecto en localhost. La biblioteca E2b ofrece **Nueva desde audio**, **Canción sin audio**, importación y respaldo JSON.
2. Pulsa **Nueva desde audio** para abrir Autopsia; selecciona el archivo y usa el analizador del laboratorio. Para una pieza sin audio, usa **Canción sin audio**.
3. Dentro de un proyecto, cambia de vista con la navegación superior. Los atajos `1`–`5` abren Autopsia, Cifrado, Loopera, Karaoke y Atril; `Escape` vuelve a la biblioteca. El foco no debe estar dentro de un campo de edición al usar estos atajos.
4. La biblioteca permite buscar por título/artista, filtrar por estado de revisión, ver el uso local y abrir o eliminar piezas. **Importar JSON** acepta canciones y respaldos; **Descargar respaldo** exporta los datos admitidos.

**Estado por etapas:** E2b reorganiza la entrada y navegación. Autopsia, Cifrado, Loopera, Karaoke, Atril y Multipista siguen usando temporalmente las vistas preexistentes dentro del shell; el análisis armónico, la edición y los controles específicos se documentan en las secciones siguientes y se reemplazarán por etapas. Algunas vistas conservan sus propios controles hasta unificarse el transporte.

El campo de archivo del navegador se vacía al recargar la página. Vuelve a seleccionar el archivo para usar acciones que necesitan el archivo original, como iniciar una nueva separación.

## 6. Herramientas y cómo funcionan

### Autopsia del audio

Es la vista principal para explorar la mezcla completa.

- La pista y su reproductor comparten una posición temporal con el mapa y los tramos.
- El mapa global puede mostrar datos como croma/armonía y constelaciones de alturas.
- **Una sola pista de acordes.** La lista de tramos es la respuesta del reconocedor. En la lista, `¿C?` es un acorde automático sin confirmar y `✓ C` es uno que decidiste vos.
- **Sensibilidad de cambios** define cuántos cambios de acorde se muestran:
  - **Estable:** a lo sumo un cambio por compás, sin colores ni bajos.
  - **Normal:** la recomendada; cambios de 2 pulsos, séptimas y otros colores si se sostienen, y slash (Am/G) si el bajo se sostiene.
  - **Detallada:** cambios de 1 pulso y colores más cortos.

  Cambiar la sensibilidad recalcula al instante y **nunca pisa lo que corregiste**.
- **Corregir un acorde.** Selecciona el tramo y usa **Acorde para estudiar / usar en el borrador**:
  - **Confirmar X** acepta la propuesta del motor.
  - **Otras lecturas** son otras raíces, colores o acordes con las mismas notas.
  - **Elegir manualmente** muestra el catálogo completo.
  - **— Automático (sin confirmar) —** borra tu decisión.
- **Evidencia por golpe (solo lectura)** muestra qué sonó en cada pulso (croma, picos, bajo) junto al acorde de la pista. Sirve para entender una decisión; el acorde se corrige en el tramo.
- La tarjeta del tramo indica la confianza, cuánto se sostiene la nota de color, qué tan fiable es el bajo y la fuerza del cambio. Con confianza baja aparece "Propuesta cercana": escucha y corrige.
- La huella de croma coteja en los mismos ejes la energía medida y las notas esperadas del acorde.
- Los registros locales anteriores al esquema v4 se borran al abrir esta versión por primera vez. No se convierten ni se restauran automáticamente; puedes importar un respaldo que hayas guardado por separado.
- El inspector puede mostrar posiciones teóricas en guitarra, bajo o piano, notas estimadas y tablatura escrita. El diapasón no afirma que el audio se haya separado por instrumento; representa posiciones posibles para tocar.
- La estructura editable permite dividir una sección en el cursor y añadir tipo, nombre, letra y tablatura ASCII. Las ediciones se guardan en el proyecto local.

Las flechas izquierda y derecha recorren los tramos cuando Autopsia está activa y el foco no está dentro de un campo de edición.

### Karaoke y escucha en vivo

Usa el micrófono para comparar una interpretación o un instrumento con la pista seleccionada.

- Activa el micrófono desde el control de escucha. El navegador pedirá permiso; localhost se trata como origen local seguro en los navegadores compatibles.
- **Comparar el micrófono con el audio cargado** activa o desactiva la referencia a la pista.
- El afinador muestra la nota individual estimada, su registro y la desviación en cents.
- **Acorde en vivo.** Se usa el mismo reconocedor que en Autopsia, con la sensibilidad elegida allí. Un cambio aparece unos 0,3–0,6 s después de tocarlo en Normal. Los colores (7, maj7…) aparecen solo si los sostenés alrededor de un segundo. En vivo no se nombran slash: Am/G se muestra como Am7, con las mismas notas.
- **Cotejo.** Con la comparación activada, dice si estás tocando el acorde que la pista tiene en ese momento: **coincide**, **parcial · sin G** (falta una nota del acorde) o **no coincide · suena como Am**. Mientras decide muestra "verificando".
- El espectro muestra energía por frecuencia, picos estimados y una huella de nota/acorde cercano. El radar/círculo muestra evidencia tonal y candidatos armónicos.
- Los botones Referencia, Cambio, Acorde, Afinidad, Cotejo, Radar, Afinador y Espectro permiten mostrar u ocultar paneles. La selección queda guardada en este navegador.

La señal del micrófono se procesa localmente y no se graba ni se envía a un servicio. La afinidad compara perfiles musicales: no es una nota de ejecución ni prueba por sí sola un acorde. Para evitar que la pista se filtre al micrófono, usa auriculares.

### Autopsia multipista

Permite separar la mezcla en stems o importar stems preparados, escucharlos y analizarlos por separado.

1. Carga el audio en Fuente y proyecto.
2. Abre **Autopsia multipista** y elige un modelo:
   - **4 pistas — htdemucs:** voz, ritmo/batería, bajo y acompañamiento restante.
   - **6 pistas — htdemucs_6s:** agrega guitarra y piano.
3. Pulsa **Separar con IA local**. La primera ejecución puede descargar los pesos del modelo. Cuando termina, cada WAV se guarda como asset del laboratorio.
4. En una pista, pulsa **Analizar pista** para generar su propio análisis y mapa armónico. Selecciona bloques del mapa para escuchar ese tramo.
5. **Enviar notas como MIDI** crea una pista MIDI estimada para la Loopera. **Agregar tramo a loopera** añade el audio de esa pista.

También puedes usar **Importar pistas separadas** para cargar varios archivos a la vez. Se reconocen nombres como voz, bajo, guitarra, batería, piano y other.

La separación es una estimación y puede dejar filtraciones o artefactos. La opción de 6 pistas es experimental; el modelo de 4 agrupa la guitarra con otros acompañamientos. Analizar cada stem por separado ayuda a atribuir notas, pero la app todavía no fusiona todas las evidencias de los stems en un único detector de acordes más preciso.

Los archivos aceptados por la API de separación son MP3, WAV, M4A, FLAC, OGG, WEBM y MP4, con un límite de 256 MB por archivo.

### Loopera

Combina fragmentos de audio, stems, grabaciones y MIDI en una línea de tiempo.

- **Reproducir**, **Pausar** y **Detener** controlan el transporte.
- Define los puntos A y B en segundos, activa **Repetir A–B**, o usa los botones A = cursor y B = cursor.
- Ajusta BPM de la grilla y velocidad de reproducción entre 0,5× y 1,5×.
- Importa un archivo MIDI estándar, agrega un MIDI estimado del análisis de la mezcla o envía las notas de un stem a una pista MIDI.
- Graba una toma desde el micrófono con los controles de grabar/detener. El navegador pedirá permiso.
- Cada pista de audio o MIDI tiene mute, solo, volumen y quitar. Arrastra un bloque para moverlo en la grilla.
- La barra espaciadora reproduce o pausa cuando Loopera está activa.

Los timbres MIDI Guitarra*, Piano*, Seno y Cuadrada son síntesis básica del navegador; no son grabaciones ni emulaciones fieles de instrumentos. La app permite importar MIDI y crear pistas MIDI internas estimadas; la exportación de un archivo MIDI final no forma parte del flujo actual.

### Escritura y calibración

Se habilita al crear una canción editable desde el laboratorio. Permite revisar el documento musical: metadatos, BPM/compás, secciones, letra, acordes, digitaciones y tablatura. Los controles de calibración permiten ajustar la interpretación temporal y reproducir el material vinculado.

Una canción creada desde el audio muestra el aviso "N de M acordes son estimados automáticamente y no están confirmados". Revísalos escuchando la pista antes de declarar la canción revisada. Los acordes slash llegan con su nota de bajo cargada.

### Escenario

Es la vista de ejecución de una canción editable: transporte de reproducción, búsqueda temporal, letra/acordes con avance, ajuste del tamaño de texto y transposición, paneles de diapasón y tablatura, pantalla completa y evaluación rítmica por micrófono.

La vista de escenario actual trabaja con una canción. El setlist de varias canciones todavía está pendiente.

## 7. Probar el reconocedor de acordes

### Con tus canciones reales (recomendado)

El banco sintético ya está casi perfecto, así que lo que falta medir es cómo le va con tu música. Con el servidor arrancado:

1. Abre [http://localhost:3000/debug/harmony-eval.html](http://localhost:3000/debug/harmony-eval.html).
2. Elige una fuente:
   - **Canción de la biblioteca:** una canción que tenga audio vinculado y un cifrado que ya revisaste. El cifrado es la respuesta correcta.
   - **Archivo de audio + referencia:** un audio y su anotación en formato `.lab`, con líneas `inicio fin acorde` en segundos y acordes como `C:maj`, `A:min7`, `G:7/3` o `N`, que es el formato de los datasets públicos. También se acepta un cifrado JSON v2 exportado.
3. Deja marcado **Evaluar solo el tramo que cubre la referencia** si el cifrado no cubre toda la grabación.
4. Pulsa **Analizar y comparar**. Se usa el mismo analizador que el laboratorio.
5. Lee el resultado:
   - **Tabla por sensibilidad:**
     - *Mayor/menor* son los aciertos de familia. *Con inversión* y *Séptimas* son más exigentes.
     - *Sobresegm.* baja cuando el motor "cambia muchísimo". *Subsegm.* baja cuando "no detecta cambios".
     - *F1 límites* dice si los cambios caen donde deben.
     - *Cambios/min* compara el motor contra la referencia.
     - En todas, 1 es perfecto.
   - **Línea de tiempo:** referencia arriba y cada sensibilidad debajo. Verde coincide y rojo no.
   - **Dónde no coincide:** los tramos más largos donde falla, con el acorde de la referencia y el del motor.
6. **Descargar reporte JSON** guarda el resultado en tu equipo. Si me lo pasás, sirve para ajustar el motor con tu música.

El audio y los resultados no salen de la computadora.

### Pruebas automáticas

- `npm run eval:harmony`: 15 progresiones sintéticas (pop, pedal, bajo caminante, bajo descendente, séptimas, silencios, desafinadas, con melodía, con batería, rubato, power chords…). Falla si alguna métrica baja respecto de `tests/harmony/harmony-baseline.json`.
- `node scripts/eval-harmony.mjs --verbose`: muestra la respuesta correcta y la del motor para cada progresión.
- `node scripts/eval-harmony.mjs --engines v6,essentia-cdb`: compara el motor contra el detector de acordes de Essentia.
- `node scripts/eval-harmony.mjs --oracle`: comprueba que el cálculo de croma coincide con el de Essentia (≈ 1 min).
- La comparación contra el motor anterior quedó registrada en `docs/rediseno/E1-comparacion-motores.json` y se resume en `docs/rediseno/E1-EVIDENCIA.md`.

## 8. Atajos de teclado

- En el shell E2b, `1` abre Autopsia, `2` Cifrado, `3` Loopera, `4` Karaoke y `5` Atril. `Escape` vuelve a la biblioteca.
- Los atajos propios de una vista heredada se conservan dentro de esa vista y no sustituyen la navegación global. Su alcance se documenta junto a cada modo cuando se migre en las siguientes etapas.

Los atajos globales no actúan mientras escribes en un campo o control de texto.

## 9. Arquitectura y flujo de datos

~~~mermaid
flowchart LR
  A[Archivo local] --> B[Navegador: análisis JavaScript / Essentia.js]
  B --> C[IndexedDB: canciones, laboratorio y audio]
  A -->|solo al separar, HTTP en localhost| D[Servidor Node.js]
  D --> E[Python: scripts/separate_stems.py]
  E --> F[Demucs + PyTorch]
  F --> G[WAV temporales de stems]
  G -->|respuesta local| B
  B --> C
  H[Micrófono] -->|Web Audio local| B
~~~

- Node sirve los archivos de la SPA y las rutas /api/separation/status, /api/separate, /api/separate/:id y /api/stems/:id/:name.
- El script de Python comprueba dependencias o ejecuta python -m demucs. Node pasa la ruta del intérprete por STAGEPROMPTER_PYTHON; si no se define, busca python en Windows y python3 en otros sistemas.
- El análisis corre en un Worker del navegador (public/js/audio/analysisPipeline.js): Essentia.js estima tempo y pulsos, y el reconocedor de acordes propio en JavaScript (public/js/harmony/) calcula la croma NNLS y decodifica la pista armónica por pulsos. La inspección de stems usa el mismo Worker.
- La pista armónica guarda sus datos de análisis comprimidos y tus decisiones como restricciones: por eso cambiar la sensibilidad no necesita volver a analizar el audio y nunca borra tus correcciones.
- IndexedDB conserva canciones, proyectos, estados y blobs de audio en el origen local del navegador. Los datos de localhost:3000 son distintos de los de otro puerto, navegador o computadora.
- Los pesos de Demucs se descargan una vez; los WAV separados se procesan localmente y se guardan en el laboratorio.

## 10. Guardado, respaldo y privacidad

Los datos se guardan en IndexedDB del navegador y del origen actual. Si borras los datos del sitio, cambias de puerto/navegador o mueves el proyecto a otro equipo, el contenido local no se transfiere automáticamente. El respaldo JSON v2 incluye canciones, proyectos y análisis, pero no los audios; los assets referenciados deben volver a vincularse.

**Reinicio de E2a:** al abrir por primera vez una base anterior a v4, la actualización elimina sus registros locales (canciones, análisis de laboratorio, preferencias y assets) y crea los stores nuevos vacíos. Es intencional: esta versión no recupera ni convierte esos datos. La aplicación lo comunica en el estado de almacenamiento.

La app no sube el micrófono ni el audio a un servicio remoto. La única descarga de red asociada a la separación es la del modelo cuando todavía no está en caché. El servidor guarda temporalmente el original recibido y la salida Demucs bajo la carpeta temporal del sistema; los stems que se usan en el laboratorio se descargan luego al navegador.

## 11. Problemas frecuentes

**“El separador local no está disponible”**

- Comprueba que instalaste torch, torchaudio y demucs con el mismo Python que usa Node.
- En PowerShell prueba: python -c "import torch, torchaudio, demucs; print(torch.__version__)".
- Comprueba /api/separation/status. Si hace falta, define STAGEPROMPTER_PYTHON con la ruta completa al python.exe correcto y reinicia npm start.

**El botón Separar está deshabilitado**

- Debe estar seleccionado un archivo de audio en Fuente y proyecto.
- La comprobación de /api/separation/status debe devolver available: true.
- Asegúrate de abrir la versión servida desde la carpeta correcta y recarga con Ctrl+F5.

**La primera separación demora o falla**

- La primera corrida descarga el modelo y necesita conexión a Internet.
- Revisa espacio en disco, memoria y que el archivo no supere 256 MB.
- Prueba primero el modelo de 4 pistas si el de 6 consume demasiados recursos.

**El resultado armónico no coincide con lo que escucho**

- La salida Demucs es una estimación, no stems perfectos. En una mezcla, los ataques, armónicos, reverberación y filtraciones cambian la evidencia.
- El acorde mostrado es una propuesta del analizador, no una transcripción garantizada. Escucha el tramo y compara la pista original con bajo, guitarra/acompañamiento y otras fuentes antes de corregirlo.
- Si **cambia demasiado**, pasa a **Estable**. Si **se pierde cambios** (un acorde de 2 pulsos, una séptima), pasa a **Detallada**. Tus correcciones se mantienen en cualquier sensibilidad.
- Acordes con las mismas notas (C6 y Am7, Am/G y C6/G) se nombran según el bajo. Si elige el otro nombre, corrígelo: la alternativa aparece en **Otras lecturas** como *mismas notas*.
- Si el tempo detectado está mal, los límites de los acordes también lo estarán, porque caen en los pulsos.
- Voz, solos y percusión densa confunden al detector; una melodía cantada no define un acorde.
- Para medir si el motor acierta con tu música, usa el banco de la sección 7.

**En vivo el acorde tarda o puntúa la pista y no lo que toco**

- Usa auriculares: si el parlante llega al micrófono, se escucha la pista.
- Un cambio tarda unos 0,3–0,6 s en aparecer (Normal); en Detallada responde más rápido y en Estable, más lento.

## 12. Archivos importantes

- server.js: servidor HTTP local, rutas de separación y ejecución de Python.
- scripts/separate_stems.py: comprobación y lanzamiento de Demucs.
- public/js/ui/audioDraftAssistant.js: laboratorio, navegación, guardado y escucha en vivo.
- public/js/ui/audioAnalysisVisualizer.js: mapas, selección de tramos e inspección armónica.
- public/js/audio/analysisPipeline.js y essentiaAnalysisWorker.js: análisis completo del audio.
- public/js/harmony/: reconocedor de acordes (croma NNLS, decodificador, refinamiento, pista armónica, seguimiento en vivo, métricas).
- scripts/eval-harmony.mjs y public/debug/harmony-eval.html: banco de pruebas del reconocedor.
- public/js/ui/multitrackWorkspace.js: autopsia multipista y Loopera.
- public/js/data/indexedDb.js: stores v4, reinicio inicial y persistencia local.
- public/js/data/projectRepo.js, projectModel.js y chartSync.js: proyectos, análisis separados y actualización idempotente del cifrado.
- docs/LABORATORIO-V2.md: recorrido y decisiones del laboratorio.
- tests/: pruebas automatizadas de análisis, armonía, segmentación, MIDI y utilidades.
- docs/rediseno/: plan por etapas del rediseño y evidencia de cada etapa.
