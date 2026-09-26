# C8 — Evidencia de tiers de notas y afinación

Estado: **primitiva de croma implementada; tiers en vivo y pitch tracking no disponibles**.

## Hecho

`public/js/music/chromaMatch.js` expone `scoreChordChroma(chroma, chordSymbol)`. Compara un vector de doce energías C..B con las notas calculadas por `music/harmony.js`, acepta el bajo de un acorde slash, y se abstiene ante señal baja o acorde desconocido. El resultado es una medida agregada de compatibilidad de pitch classes, sin afirmar qué cuerda se tocó ni transcribir notas individuales.

Pruebas: croma C–E–G frente a C, energía de notas ajenas, bajo slash, silencio, símbolo desconocido y entradas/umbrales fuera de rango.

## No disponible todavía

- El evaluador C6 solo obtiene eventos de ataque del micrófono. No hay extractor de croma en vivo ni evaluación de tier 2 conectada a la interfaz.
- El pitch tracker monofónico C8 no está implementado; no aparece afinación en centésimas.
- El criterio de aceptación de C6 no se ha medido en un dispositivo de audio. No se habilitan tiers basándose solo en este helper.

`npm test` confirma lógica pura del helper, pero esto no equivale a validación de entrada de micrófono ni a evaluación musical en tiempo real.
