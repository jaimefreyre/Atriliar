# C9 — Evidencia de escenario reducido

Estado: **implementado y verificado en el navegador integrado**.

## Cambios

- El reproductor principal ofrece un control explícito para entrar y salir de pantalla completa.
- Al entrar, solicita Wake Lock si el navegador lo admite; si la pestaña vuelve a estar visible mientras continúa en pantalla completa, intenta recuperarlo.
- Al salir de pantalla completa o cerrar el reproductor, libera Wake Lock y elimina los listeners `fullscreenchange`/`visibilitychange`.
- El estado se comunica con una región `role="status"` y el control expone `aria-pressed`.
- Se reforzó `wakeLock.js` para no pedir un segundo bloqueo si ya hay uno activo y para devolver un resultado booleano verificable.
- La capa de acciones existente conserva Espacio (play/pausa), flechas (bloque anterior/siguiente) y Esc (salir del reproductor). No se agregó una segunda capa de teclado.

## Verificación

- Navegador integrado en `http://localhost:3000/`: la demo abrió el reproductor; el control entró en pantalla completa y anunció que Wake Lock estaba activo. El control cambió a “Salir de pantalla completa”.
- Salir mediante el control restauró la vista y anunció “Pantalla completa cerrada”.
- `ArrowRight` movió el transporte al inicio del siguiente bloque (0:00 → 0:04); Espacio cambió el estado de `ready` a `playing`; Esc cerró el reproductor y volvió a la biblioteca.
- `npm test`: 114/114 pruebas pasan. `git diff --check` pasa.

## Alcance diferido

El setlist multi-canción, avanzar canción desde pedal y las alertas ligadas a cambios de set siguen como extensión futura, según el pivot. No se implementaron en este checkpoint.
