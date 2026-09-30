# E2a — Persistencia unificada

## Resultado

El laboratorio guarda un `SongDocument v2` canónico, un proyecto local ligero y un registro de análisis separado en IndexedDB. La letra, la tablatura y las secciones se rehidratan desde la canción vinculada; los cambios del laboratorio se vuelven a guardar en esa misma canción. El audio permanece como asset local y las escrituras de canción, proyecto, análisis y asset se realizan en una transacción atómica.

## Reinicio inicial solicitado

La versión de IndexedDB sube a v4. En la primera actualización desde una base anterior, la transacción vacía todos los registros existentes, incluidos canciones, laboratorios, preferencias y assets. No se convierte, importa ni descarga un respaldo de esos datos. La app informa que el reinicio ocurrió. A partir de ahí se crean proyectos y análisis con el modelo vigente.

## Archivos de la etapa

- `public/js/data/indexedDb.js`: stores `projects` y `analyses`, escritura atómica y reinicio único pre-v4.
- `public/js/data/projectModel.js`: conversión entre laboratorio y documento v2, IDs de canción estables y rehidratación de letra/tab.
- `public/js/data/projectRepo.js`: carga, guardado, borrado e importación de los registros del proyecto.
- `public/js/data/chartSync.js`: proyección idempotente de regiones armónicas; conserva acordes manuales y evita solapamientos.
- `public/js/data/backup.js`, `public/js/app.js`: respaldo JSON v2 e importación de proyecto/análisis vinculados a canciones que sí se importaron.
- `public/js/ui/audioDraftAssistant.js`: usa la persistencia nueva y ya no ofrece conversión de análisis del motor anterior.

## Verificación

- `npm test`: 246 pruebas aprobadas.
- `npm run eval:harmony`: pasa la línea base actual del reconocedor.
- `npm run build:shell`: manifiesto offline regenerado.
- `node --check` en los módulos de persistencia y la UI; `git diff --check` sin errores de espacios.

La actualización destructiva se ejecuta cuando el navegador abre por primera vez la nueva versión; no se ha simulado una base de usuario dentro de un navegador automatizado durante esta etapa.
