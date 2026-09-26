# C10 — Evidencia y límites de cierre

Estado: **base offline/exportación implementada; aceptación integral todavía abierta**.

## Implementado

- `public/sw.js` registra tres cachés versionadas: shell esencial (incluye el validador generado), recursos del repertorio bajo demanda y herramientas opcionales de Essentia. La caché de Essentia solo se solicita al abrir el asistente de audio y queda fuera del mensaje de preparación del repertorio.
- Las canciones y audios ya guardados siguen teniendo IndexedDB como almacenamiento principal offline. Al reproducir una canción con archivo se envía su asset a la caché de recursos del set; también se cachean fixtures JSON cuando se usan. Los blobs se excluyen de la exportación.
- La biblioteca muestra el estado de la app offline y la estimación de cuota, y solicita persistencia mediante `navigator.storage.persist()`.
- `RESPALDO JSON` exporta canciones v1 y v2 y puede reimportarse desde `IMPORTAR`; cada documento v2 se valida con el flujo normal. Si faltan los blobs, se avisa que debe volver a vincularse el audio.
- `server.js` permite solo `GET`/`HEAD`, ofrece `GET /health`, resuelve archivos bajo `public/`, y sirve tipos MIME explícitos.

## Evidencia comprobada

- Navegador integrado en localhost: el Service Worker instaló lo suficiente para que `navigator.serviceWorker.ready` resolviera; la biblioteca mostró preparación offline y cuota (414 KB usados, aproximadamente 10 GB disponibles en esa sesión). El navegador no concedió persistencia en esa prueba, así que avisó que puede limpiar almacenamiento bajo presión.
- La biblioteca mantuvo disponibles las canciones guardadas en IndexedDB después de recargar. El asistente de audio abrió sin error; su caché de análisis se solicita de forma diferida al abrirlo.
- Después de abrir el asistente con conexión, la estimación visible de almacenamiento pasó de 414 KB a 3.2 MB, consistente con la caché opcional de Essentia solicitada al abrirlo; el navegador integrado no expuso un listado directo de las claves Cache Storage para confirmar cada entrada.
- Servidor iniciado en puerto alternativo 3117 para pruebas aisladas: `/health` respondió 200 con `{"status":"ok"}`; `HEAD /js/app.js` respondió 200 con MIME JavaScript y sin cuerpo; `GET /js/app.js` respondió 200; traversal a `/../server.js` quedó dentro de `public/` (404); ruta con NUL se rechazó (403); `POST /health` se rechazó (405).
- La consola del navegador integrado no mostró errores ni advertencias al cargar la biblioteca ni al abrir/cerrar el asistente.
- `npm test`: 115/115 pruebas pasan. `node --check server.js`, `node --check public/sw.js` y `git diff --check` pasan.

## Aceptación pendiente y tabla de soporte honesta

| Función | Estado comprobado | Límite actual |
|---|---|---|
| Biblioteca, editor, transporte, prompter, diapasón, tab | Soportado por C0–C5; smoke del reproductor en navegador | Setlist de show continúa diferido. |
| Evaluador — ritmo | Prototipo implementado en C6 | No se midió latencia ni sangrado de parlantes; métrica no certificada para interpretación. |
| Evaluador — notas del acorde | Helper puro disponible en C8 | No hay croma del micrófono en vivo ni integración en el evaluador. |
| Evaluador — afinación en solos | No disponible | C8 no está implementado y no hay precisión validada. |
| Borrador desde audio — BPM | Prototipo local; tempo sintético de 120 BPM estimado cerca de 120 | Requiere corregir y declarar revisado manualmente. |
| Borrador desde audio — acordes | Experimental; no soportado como transcripción final | Falló la progresión sintética C–G–F–C; las sugerencias se deben corregir. |
| Borrador desde audio — letra/Whisper | No disponible | No se incorporó Whisper; la letra queda vacía. |
| App y repertorio offline | Shell y almacenamiento local preparados | No se completó la prueba con red/Node detenidos y reinicio del mismo origen. |
| Herramientas de análisis offline | Cache opcional solicitada al abrir el asistente | No se comprobó aún una segunda ejecución del análisis sin red. |
| Respaldo/restauración JSON | Implementado, blob de audio excluido | Restaurar canciones que referencian audio requiere volver a adjuntarlo. |

El usuario autorizó el micrófono de localhost para el spike C6, pero el navegador integrado no abrió el diálogo ni resolvió `getUserMedia()`. El navegador Chrome no está disponible en esta sesión. La medición acústica sigue pendiente en Chrome/Edge con el micrófono habilitado; no se atribuye aprobación funcional al evaluador hasta completarla.

La prueba “desconectar Internet + detener Node + reabrir el mismo origen” no se ejecutó: el proceso que ya ocupaba `localhost:3000` pertenece al entorno previo y no se detuvo. Las pruebas del nuevo `server.js` se hicieron en el puerto alternativo controlado por esta tarea.
