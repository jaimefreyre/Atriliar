# C7 — Evidencia y estado del asistente de audio

Estado: **flujo vertical integrado; análisis armónico aún experimental y C7 abierto**.

## Comprobado en esta sesión

- `npm test`: 113/113 pruebas pasaron después de agregar decodificación local, comparación de plantillas, segmentación y borrador v2.
- `npm run build:validator` incorporó el nuevo método `timing.method: "auto-analyzed"`; un borrador sin letra y con una sección instrumental exacta pasa schema e invariantes semánticas.
- El navegador decodificó un WAV sintético de 16 s, envió PCM al Worker de Essentia, mostró una vista previa y creó el borrador `temp-audio-test` en el editor. La importación fue v2 y quedó como `estimated`; se dejó apagada la opción de guardar el Blob en esta prueba.
- Essentia informó aproximadamente 120 BPM para el fixture controlado. El reconocimiento dio 31 pulsos, 54 onsets y 18 sugerencias en 31 segmentos de acorde para una progresión sintética C–G–F–C.

## Límite que impide cerrar C7

El analizador del fixture propuso cambios dudosos y un acorde incorrecto aceptado (Fm para el segmento generado como F mayor); no encontró la progresión G mayor y no alineó sus cambios de punta a punta. También reportó más ataques que los 32 ataques insertados. El flujo conserva solo candidatos con margen suficiente como borrador y muestra advertencias en el editor, pero todavía no cumple la aceptación de generar una progresión fiable desde audio real. El porcentaje/confianza de Essentia no se muestra como puntuación porque su escala observada no está normalizada.

No se probó un audio musical real. Hasta verificar distintos instrumentos, grabaciones y géneros, los acordes son sugerencias para corregir escuchando; no deben publicarse como transcripción final. No se agregó Whisper: el borrador mantiene `lines: []` porque inferir y alinear letra queda fuera de esta entrega parcial.

## Fuentes técnicas

Essentia documenta HPCP como cromagrama cuyos bins, con tamaño 12, corresponden a A..G#; el Worker reordena esos bins al convenio C..B que usa el motor musical de StagePrompter. La documentación oficial también limita `ChordsDetection` a triadas mayores/menores, por eso el código compara templates conocidos y guarda solo símbolos validados por el parser local. [Documentación oficial de HPCP](https://essentia.upf.edu/reference/streaming_HPCP.html), [API de Essentia.js](https://mtg.github.io/essentia.js/docs/api/Essentia.html).
