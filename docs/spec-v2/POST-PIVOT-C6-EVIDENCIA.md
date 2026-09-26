# C6 — Evidencia y estado del spike

Estado: **implementación lista para prueba con entrada de audio; criterio acústico pendiente**.

## Comprobado en esta sesión

- `npm test`: 103/103 pruebas verdes, incluidas las pruebas de emparejamiento, tolerancia y pulsos futuros.
- `npm run build:validator`: genera el validador ESM desde el contrato canónico.
- `npm run vendor:essentia`: copia a `public/vendor/essentia/` la distribución local fijada en `package-lock.json`; la app no solicita artefactos a un CDN.
- En el navegador integrado, el Worker de módulos carga Essentia.js y WASM. El fixture sintético de 16 s a 120 BPM produjo **120.0 BPM, 31 pulsos y 32 onsets**. El campo `rhythmConfidence` informado por la librería fue 3.861, por lo que no se interpreta como porcentaje ni se enseña aún al usuario.
- La app cargó la canción demo v2 desde JSON, mostró el reproductor, diapasón, tablatura bajo demanda y panel de evaluación. El micrófono del evaluador no se pidió al abrirlo; solo existe activación explícita.

## Pendiente antes de cerrar C6

Se autorizó el uso del micrófono local para el spike, pero `getUserMedia()` en el navegador integrado quedó en estado “Esperando permiso del micrófono…” sin mostrar un diálogo ni resolver la promesa. Por eso no hay medición de latencia, nivel ni contaminación entre parlantes/auriculares. No se presenta el puntaje del fixture como precisión acústica. El arnés `public/debug/mic-latency-harness.html` permite repetir la medición en Chrome/Edge con permiso de micrófono y dispositivo de audio disponibles.

El detector actual mide ataques globales de amplitud; no identifica instrumentos ni separa con fiabilidad un instrumento del audio de referencia que llega por los parlantes. Hasta completar la comparación, se debe recomendar auriculares y considerar solo una guía de ensayo.

## Licencia de la dependencia

`essentia.js` declara AGPL-3.0. La [información oficial de licenciamiento de Essentia](https://essentia.upf.edu/licensing_information.html) indica que las aplicaciones no comerciales pueden usar Essentia bajo AGPLv3 y que existe licencia comercial por consulta. No distribuir una versión comercial que incluya estos artefactos sin resolver la licencia aplicable.
