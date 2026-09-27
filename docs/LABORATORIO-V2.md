# Laboratorio del sonido · v2

La rama `v1-stageprompter` conserva la versión anterior. `v2-laboratorio` reúne carga,
reproducción, análisis y escritura alrededor de la pista. Ambas usan documentos de
canción v2; la nueva rama añade `labProjects` a IndexedDB para conservar el análisis
completo sin agregar campos experimentales al documento portable.

## Recorrido

1. Abrir **Nuevo laboratorio**, elegir un audio local y pulsar **Analizar archivo**.
2. La pista permanece visible arriba. El mapa de amplitud, el mapa armónico y la lista
   comparten tiempo: pulsar un tramo lo selecciona, reproduce y muestra su estado.
   Pulsar una sección reproduce esa sección completa.
3. En el inspector se revisan croma, picos espectrales y acordes alternativos, además
    de posiciones teóricas de guitarra, bajo y piano. La tablatura solo aparece si fue
    escrita por el usuario; el analizador no inventa digitaciones.
   Debajo de la forma de onda y el reproductor, el recorrido armónico dibuja tres líneas
   con las alturas probables de las notas del acorde a lo largo de toda la pista. El eje
   parte de la nota más grave detectada; sus marcas laterales indican notas usadas, y
   al pulsar un punto se escucha ese tramo. Los controles Grave/Media/Aguda aíslan
   cada línea; al pasar el puntero se identifica la nota y, con una sola línea visible,
   sus cambios quedan rotulados. En el diapasón, los círculos magenta marcan las
   notas/octavas dominantes del FFT; el resto conserva las posiciones teóricas de acorde,
   bajo y escala. El círculo de quintas con radar de croma está en la cabecera del mapa,
   donde estaban las ayudas contextuales. Los proyectos anteriores usan sus picos por pulso.
4. **Dividir aquí** crea otra sección en el tramo seleccionado. En cada sección se
   puede escribir nombre, tipo, letra y tablatura ASCII.
5. El laboratorio se guarda localmente con su audio y puede reabrirse desde la
   biblioteca. **Crear canción editable** produce un SongDocument validado y abre
   la calibración. Desde una canción vinculada se puede volver al laboratorio.

El reconocimiento armónico, la constelación de graves/agudos y la forma de onda son
análisis de una mezcla. Las posiciones dibujadas son lugares posibles para tocar
las notas de un acorde, no una separación de instrumentos ni una transcripción MIDI.
El proyecto conserva picos, pulsos, croma y correcciones como base para desarrollar
extracción de notas por evento en una etapa posterior.

## Datos

`songsV2` sigue siendo el formato de canción portable. `assets` guarda el audio
elegido y `labProjects` guarda mapa, estructura de trabajo y decisiones del usuario.
Un proyecto y la canción que creó pueden compartir un mismo asset. Al borrar solo el
proyecto, el asset se conserva si la canción lo usa.

Los archivos locales se procesan en el navegador y se guardan en IndexedDB del
origen local. El respaldo JSON existente conserva canciones, pero no incluye audio
ni proyectos de laboratorio; para mover el laboratorio completo hace falta una
función de exportación de proyecto y medios en una versión futura.
