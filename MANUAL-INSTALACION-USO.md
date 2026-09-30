# StagePrompter — manual de instalación y uso

Este manual describe la versión local del **Laboratorio del sonido**: requisitos, instalación, arranque, herramientas, almacenamiento y límites conocidos. Está escrito a partir del código presente en este proyecto.

## 1. Qué es la aplicación

StagePrompter es una aplicación web local para estudiar una canción, relacionar lo que se oye con posibles notas y acordes, escribir una versión editable y ensayarla. El navegador ejecuta la interfaz y el análisis musical normal. Node.js sirve la aplicación y ofrece una API local para la separación de fuentes. Python y Demucs son opcionales y se usan solo al separar una mezcla.

No es un servicio en la nube: al separar, el navegador envía el audio al servidor Node que corre en esta misma computadora, y ese servidor ejecuta Demucs localmente. El navegador conserva los proyectos y medios en IndexedDB.

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

### Comprobación rápida

En otra terminal de PowerShell:

~~~powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/api/separation/status
~~~

La primera respuesta debe indicar estado ok. Si Python y Demucs están disponibles, la segunda debe incluir available: true y “Demucs listo para separar en este equipo”. También puedes ejecutar npm test desde la carpeta del proyecto para validar la suite de pruebas.

## 5. Recorrido inicial

1. Abre el proyecto en localhost y entra al **Laboratorio del sonido**.
2. En **Fuente y proyecto**, selecciona un audio o video compatible, completa título y artista si quieres, y pulsa **Analizar archivo**.
3. Espera a que termine el análisis. El BPM sugerido se puede corregir.
4. Usa los cuatro espacios de trabajo: **Autopsia del audio**, **Karaoke y escucha en vivo**, **Autopsia multipista** y **Loopera**.
5. Guarda con **Guardar laboratorio**. **Crear canción editable** convierte el borrador del laboratorio en una canción que puedes revisar en **Escritura y calibración** y abrir en **Escenario**.

El campo de archivo del navegador se vacía al recargar la página. Vuelve a seleccionar el archivo para usar acciones que necesitan el archivo original, como iniciar una nueva separación.

## 6. Herramientas y cómo funcionan

### Autopsia del audio

Es la vista principal para explorar la mezcla completa.

- La pista y su reproductor comparten una posición temporal con el mapa y los tramos.
- El mapa global puede mostrar datos como croma/armonía y constelaciones de alturas. La resolución por pulsos guarda observaciones breves para estudiar melodías; los tramos armónicos agrupan cambios sostenidos para estudiar acordes.
- Selecciona un tramo para escucharlo y ver sus propuestas, picos espectrales, perfiles de notas y visualizaciones relacionadas.
- La huella de croma coteja en los mismos ejes la energía medida y las notas esperadas de un acorde elegido. El acorde sugerido es una hipótesis con confianza orientativa, no una transcripción confirmada.
- El inspector puede mostrar posiciones teóricas en guitarra, bajo o piano, notas estimadas y tablatura escrita. El diapasón no afirma que el audio se haya separado por instrumento; representa posiciones posibles para tocar.
- La estructura editable permite dividir una sección en el cursor y añadir tipo, nombre, letra y tablatura ASCII. Las ediciones se guardan en el proyecto local.

Las flechas izquierda y derecha recorren los tramos cuando Autopsia está activa y el foco no está dentro de un campo de edición.

### Karaoke y escucha en vivo

Usa el micrófono para comparar una interpretación o un instrumento con la pista seleccionada.

- Activa el micrófono desde el control de escucha. El navegador pedirá permiso; localhost se trata como origen local seguro en los navegadores compatibles.
- **Comparar el micrófono con el audio cargado** activa o desactiva la referencia a la pista.
- El afinador muestra la nota individual estimada, su registro y la desviación en cents.
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

### Escenario

Es la vista de ejecución de una canción editable: transporte de reproducción, búsqueda temporal, letra/acordes con avance, ajuste del tamaño de texto y transposición, paneles de diapasón y tablatura, pantalla completa y evaluación rítmica por micrófono.

La vista de escenario actual trabaja con una canción. El setlist de varias canciones todavía está pendiente.

## 7. Atajos de teclado

- M: activar o apagar el micrófono.
- 1: Autopsia del audio.
- 2: Karaoke y escucha en vivo.
- 3: Autopsia multipista.
- 4: Loopera.
- R: activar o desactivar la comparación entre micrófono y audio.
- Flechas izquierda/derecha: tramo anterior o siguiente en Autopsia.
- Barra espaciadora: reproducir/pausar la Loopera cuando esa vista está activa; en otras vistas controla el reproductor principal.

Los atajos no actúan mientras escribes en un campo o control de texto.

## 8. Arquitectura y flujo de datos

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
- Essentia.js y los módulos de análisis JavaScript corren en el navegador. La inspección de stems también vuelve a usar el worker de análisis del navegador.
- IndexedDB conserva canciones, proyectos, estados y blobs de audio en el origen local del navegador. Los datos de localhost:3000 son distintos de los de otro puerto, navegador o computadora.
- Los pesos de Demucs se descargan una vez; los WAV separados se procesan localmente y se guardan en el laboratorio.

## 9. Guardado, respaldo y privacidad

Los datos se guardan en IndexedDB del navegador y del origen actual. Si borras los datos del sitio, cambias de puerto/navegador o mueves el proyecto a otro equipo, el contenido local no se transfiere automáticamente. El respaldo de canciones JSON actual no incluye los audios ni todos los proyectos del laboratorio. Exportar/importar un paquete completo de proyecto con medios es una mejora pendiente.

La app no sube el micrófono ni el audio a un servicio remoto. La única descarga de red asociada a la separación es la del modelo cuando todavía no está en caché. El servidor guarda temporalmente el original recibido y la salida Demucs bajo la carpeta temporal del sistema; los stems que se usan en el laboratorio se descargan luego al navegador.

## 10. Problemas frecuentes

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

## 11. Archivos importantes

- server.js: servidor HTTP local, rutas de separación y ejecución de Python.
- scripts/separate_stems.py: comprobación y lanzamiento de Demucs.
- public/js/ui/audioDraftAssistant.js: laboratorio, navegación, guardado y escucha en vivo.
- public/js/ui/audioAnalysisVisualizer.js: mapas, selección de tramos e inspección armónica.
- public/js/ui/multitrackWorkspace.js: autopsia multipista y Loopera.
- public/js/data/indexedDb.js: persistencia local.
- docs/LABORATORIO-V2.md: recorrido y decisiones del laboratorio.
- tests/: pruebas automatizadas de análisis, segmentación, MIDI y utilidades.
