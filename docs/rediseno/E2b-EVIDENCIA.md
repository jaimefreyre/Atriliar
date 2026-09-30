# E2b — Shell y biblioteca

## Resultado

La raíz de la aplicación ahora abre la biblioteca E2b, con navegación por canción, inspector contextual, dock de transporte y rutas de proyecto. La interfaz antigua sigue disponible dentro de `legacy.html` mientras se reemplazan sus vistas por etapas; `?ui=legacy` permite abrirla completa para comparar.

La app no se había actualizado en el localhost que mostraba la captura: esa instancia seguía sirviendo la interfaz vieja. Esta etapa se ejecutó y comprobó con el servidor aislado en el puerto 3100; el puerto 3000 no se tocó.

## Cambios

- `public/index.html` quedó como entrada ligera del shell. El HTML anterior se conserva como `public/legacy.html`, y el código antiguo de arranque pasó a `public/js/legacyApp.js`.
- `public/js/app.js` inicializa el router, shell, biblioteca y mensajes locales.
- El shell prepara el service worker desde la raíz; las vistas embebidas no lo registran por segunda vez. La suite de navegador usa `?e2e=1` y no registra el service worker.
- `public/js/ui/shell/` agrega rutas persistentes, host temporal de vistas antiguas, inspector, dock y atajos `1`–`5`/`Escape`.
- `public/js/ui/library/libraryView.js` ofrece crear desde audio o sin audio, buscar y filtrar, importar JSON, exportar respaldo, revisar almacenamiento y abrir/eliminar una pieza. Los documentos v1 se agrupan para su conversión.
- `public/js/ui/components/dialogs.js` y `public/css/dialogs.css` reemplazan confirmaciones y alertas nativas con `<dialog>` y avisos accesibles.
- El asistente anterior puede cambiar de vista desde las rutas del shell y notificar al shell cuando el proyecto queda persistido.
- Para aislar los estilos globales de las vistas existentes, se usa un `iframe` del mismo origen desmontable en vez de inyectar las hojas viejas en el documento del shell. Al desmontar una vista se elimina su contexto y sus estilos.
- `public/debug/e2e/` agrega un runner con una onda sintética y un SongDocument v2 temporal. La limpieza borra solamente ese ID de prueba.
- `MANUAL-INSTALACION-USO.md` describe la entrada y navegación nuevas y aclara qué sigue temporalmente embebido.

## Verificación

- `npm test -- --test-reporter=dot`: suite completa aprobada.
- `npm run eval:harmony`: sin regresiones; promedio Normal: mayor/menor 0,997, séptimas 0,993, F1 de límites 0,996 y cambios 0,993× de referencia.
- `npm run build:shell` y `node scripts/build-shell-manifest.cjs --check`: manifiesto offline actualizado, 101 archivos.
- `git diff --check` y `node --check public/debug/e2e/runner.js`: sin errores.
- Runner E2b en navegador limpio, sin micrófono ni subida de datos: 12 comprobaciones aprobadas, incluyendo navegación a los seis modos, entrada de audio sintético, cambio de vista conservando el audio, importación v2, persistencia de ruta tras recargar y eliminación confirmada del registro temporal. La consola no mostró errores ni advertencias.
- Capturas visuales revisadas en escritorio, tablet (768 × 1024) y móvil (390 × 844). `documentElement.scrollWidth` coincidió con `clientWidth` en los tres tamaños (1280, 768 y 375 CSS px respectivamente); no aparece desplazamiento horizontal de página.

## Límites

- E2b cambia la entrada y navegación. Autopsia, Cifrado, Loopera, Karaoke, Multipista y Atril se muestran aún desde la experiencia anterior dentro de un `iframe`; sus flujos y diseño interior se irán sustituyendo en E3–E6. En algunos modos hay controles de reproducción propios mientras se migra el transporte común.
- La instancia que el usuario tenía en 3000 sigue sin cambios. La interfaz nueva se ve en `http://localhost:3100/`; para usar la nueva raíz en 3000, el servidor de ese puerto tendrá que apuntar a esta rama cuando el usuario lo cambie.
- El micrófono no se solicitó ni se probó en E2b.
- La suite se completó en una pestaña limpia; una pestaña de prueba anterior conservaba estado de navegación obsoleto. El runner ya termina correctamente en una pestaña nueva.
