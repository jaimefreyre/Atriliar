# C11 — estudio armónico interactivo

## Resultado

El asistente «Borrador desde audio local» permite revisar una pista tramo por tramo antes de crear el borrador. Cada tramo conserva la sugerencia del reconocedor y sus seis mejores alternativas, pero queda **sin acorde asignado** hasta que el músico lo elija. También se puede dejar explícitamente sin asignar. El selector incluye propuestas y un catálogo para corregir a mano. El contador refleja los acordes que el músico confirmó y los tramos pendientes.

La superficie de estudio incluye:

- mapa de toda la pista con energía relativa de las 12 clases de altura (HPCP/croma);
- vistas temporales de constelación de bajos y registro alto;
- al seleccionar una región, barras por nota y lista de picos espectrales con altura/octava aproximada y frecuencia;
- selección desde la lista o el mapa, que lleva el reproductor local al comienzo de ese tramo;
- comparación con la pista guía y corrección manual antes de crear el borrador.

En el reproductor, el panel de armonía permite fijar cualquier acorde del documento para estudiar su diapasón y piano, aunque la pista continúe avanzando; «Ir a este acorde» busca su posición en la pista.

## Interpretación y límites

El reconocedor actual sigue siendo exploratorio. Su ajuste y margen son similitudes internas, **no probabilidades**. HPCP resume energía por clase de altura y los picos espectrales pueden incluir armónicos de una nota, ruido o componentes de otros instrumentos; por eso el visualizador los llama picos estimados, no fundamentales ni notas separadas garantizadas. Las constelaciones ayudan a comparar y a formular una lectura musical; no aseguran transcripción polifónica.

Solo los acordes seleccionados se copian al borrador. El sistema permite crear un borrador parcial o sin acordes si el usuario aún no confirma regiones. Letra, sección, melodía y bajo no se transcriben automáticamente en esta etapa.

## Validación de este checkpoint

- Se analizó en navegador una pista sintética local de 16 segundos, con cambios C–G–F–C, mediante el flujo de producción con Essentia.
- El mapa mostró 18 tramos, con sugerencias C/G/F en las regiones correspondientes, pero **0 acordes asignados** inicialmente.
- Se verificaron las tres capas globales: croma/armonía, bajos y registro alto.
- Se eligió manualmente Dm para el primer tramo: apareció `✓ Dm`, la lista indicó 1 asignado y 17 sin asignar, y el análisis mostró HPCP y picos de frecuencia para esa región.
- La pista y cambios se mantuvieron dentro del navegador local; no se guardó el borrador de prueba.
- `node --test --test-reporter=dot tests/` y comprobaciones sintácticas de los módulos cambiados pasaron.

La pista sintética comprueba el flujo de interfaz y el manejo de datos; **no** es una medida de precisión de reconocimiento para grabaciones reales, mezclas polifónicas o audio de escenario. Esa evaluación queda abierta y requiere una colección musical real con anotaciones de referencia.
