# Diseño del monitor de escenario

Artefacto asociado: [abrir el diseño interactivo](./diseno-interactivo.html).

La entrega es una **maqueta interactiva de diseño**, diferenciada de la aplicación StagePrompter existente en `public/`. “ATRIL” es el nombre visual propuesto para este diseño; no implica haber renombrado la aplicación base. No implementa el MVP, un backend nuevo, audio, IA, MIDI, importación o persistencia. Puede abrirse directamente como archivo HTML; usa JavaScript y CSS incluidos, sin red, fuentes externas ni dependencias. El archivo usa una canción y un repertorio originales de demostración.

## Principio de lectura

La letra ocupa el área principal. Su línea activa permanece en el centro de una ventana de tres posiciones: anterior, actual y siguiente. Al cambiar de bloque se reemplaza el contenido de esas posiciones sin desplazar el documento ni usar un desplazamiento animado. El tiempo no se deduce del scroll.

Cada fragmento de texto contiene su acorde anclado por CSS. Cambiar el tamaño de letra o la anchura de la ventana no depende de una cantidad de espacios monoespaciados. La maqueta tiene dos anclas por bloque; la aplicación final puede admitir más mediante el contrato de datos.

| Elemento | Tratamiento visual | Propósito |
|---|---|---|
| Fondo del monitor | Negro `#020303` | Reducir luz emitida y separar escenario del área de preparación. |
| Línea activa | Amarillo `#f2f66f`, tamaño máximo y barra vertical | Ubicar el punto de lectura sin depender solo del color. |
| Acordes | Cian `#81e5da`, encima de su fragmento | Anticipar la armonía y mantener el vínculo con la letra. |
| Línea anterior | Gris `#7d8780`, menor tamaño | Contexto recuperable sin competir con el presente. |
| Línea siguiente | Gris claro `#cbd2ca`, menor tamaño | Preparar la entrada siguiente. |
| Sección | Etiqueta textual y borde | Reconocer verso, estribillo, interludio y final. |
| Mensaje urgente | Banda roja amplia, texto blanco, sin parpadeo | Un aviso claro durante tres segundos sin destellos invasivos. |

## Distribución

### Ensayo

Una cabecera externa identifica expresamente el prototipo. El monitor conserva título, tono, tempo, compás, pulso visual, reloj local y estado del reloj guía de demostración. A la izquierda, el setlist distingue canciones tocadas, actual y próximas. Esta lista es ilustrativa: no simula cargar otras canciones.

El pie del monitor reúne seek, tiempo reproducido, duración, próxima canción, entrada y una estimación del resto del set. La estimación corresponde al repertorio ficticio; no promete medir una presentación real.

Debajo del monitor se encuentran transporte, tamaño de letra y botones para mostrar u ocultar paneles. El diapasón y la tablatura se muestran juntos cuando la anchura lo permite y se apilan en pantallas menores. El diapasón se desplaza horizontalmente dentro de su panel; no ensancha todo el documento.

### Escenario

Entrar en escenario oculta la cabecera de diseño, el setlist y los paneles complementarios, conserva los controles necesarios y amplía la letra. La superficie de lectura domina la altura disponible en pantallas de escritorio. No se fuerza pantalla completa: esa capacidad es un control separado y solo aparece si el navegador la soporta.

Los paneles se pueden volver a mostrar durante el escenario. Salir restaura los estados de visibilidad del ensayo. El botón “Salir del escenario” permanece visible y la tecla Escape vuelve al ensayo, incluso después de enfocar un botón.

### Adaptación prevista

El CSS incluye reglas para escritorio amplio, 1440/1280 px, tableta y móvil. En móvil, la cabecera se apila, el setlist se convierte en una tira horizontal y los controles de panel ocupan una fila propia. No se intenta reducir una pantalla de escenario completa a una miniatura. Para ampliar la letra, el contenido puede crecer verticalmente; no se oculta el desbordamiento de lectura.

La existencia de estas reglas no equivale a una certificación de accesibilidad ni a pruebas de todas las resoluciones o monitores físicos.

## Interacciones disponibles

| Control | Comportamiento de la maqueta |
|---|---|
| Reproducir / Pausar | Recorrido **mudo** de 32 segundos. Reloj relativo con `performance.now()`, sin contar intervalos para calcular tiempo. |
| Seek | Posición arbitraria entre 0 y 32 segundos; recalcula bloque, acorde, compás y pulso. |
| Anterior / Siguiente | Salto al comienzo del bloque adyacente. Conserva reproducción o pausa. |
| Fin de demo | Se detiene al segundo 32. Reproducir nuevamente vuelve al comienzo. |
| A− / A+ | Tamaño de letra del 70 % al 140 %, en pasos de 10 %. |
| Setlist / Diapasón / Tablatura | Ocultan o muestran sus superficies y exponen `aria-expanded`. |
| Ensayo / Escenario | Cambian el entorno de lectura y exponen `aria-pressed`. |
| Pantalla completa | Usa la API nativa cuando está disponible; informa un rechazo del navegador. |
| Probar alerta | Superpone un mensaje durante tres segundos sin alterar la reproducción. |
| Vista de diseño: sin canción | Muestra estado vacío, desactiva transporte y vacía datos de armonía y tablatura. |
| Tónica, escala y capas | Actualizan el diapasón de demostración. |

Atajos: Espacio reproduce/pausa, flechas izquierda/derecha cambian bloque, E alterna entorno, Escape vuelve al ensayo. Los atajos de reproducción y navegación no interceptan campos de formulario, botones ni contenido editable. La navegación nativa de los controles se conserva.

## Diapasón

El dibujo usa afinación estándar E–A–D–G–B–E, seis cuerdas y trastes 0 a 22. Visualmente la primera cuerda está arriba. El traste 0 representa una cuerda al aire; el cálculo de cada posición parte de su MIDI abierto más el número de traste, reducido a clase de altura.

Se distinguen cuatro capas que pueden activarse individualmente:

- **Fundamental del acorde**: contorno amarillo.
- **Notas del acorde**: círculo cian.
- **Bajo indicado por el acorde**: contorno cuadrado violeta.
- **Notas de la escala seleccionada**: círculo gris.

Una posición puede tener varios atributos simultáneos. El acorde inicial `Am/C` permite comprobar la diferencia entre fundamental A, bajo C y notas A–C–E. La fundamental del acorde no sustituye a la tónica de la escala: son campos independientes. La escala se selecciona manualmente; la maqueta no recomienda automáticamente una escala.

El catálogo de demostración incluye 18 escalas: los siete modos diatónicos, pentatónica menor, blues menor, bebop dominante, bebop mayor, bebop menor (variante dórica), frigio dominante, doble armónica mayor, Hirajōshi, Kumoi, Kumoijoshi e Iwato. La doble armónica mayor tiene intervalos `[0,1,4,5,7,8,11]`; “árabe” puede aparecer únicamente como alias de una convención occidental, sin representar toda la música árabe ni sistemas microtonales. Hirajōshi `[0,2,3,7,8]`, Kumoi `[0,2,3,7,9]` y Kumoijoshi `[0,1,5,7,8]` conservan fórmulas distintas. La aplicación final debe documentar fórmula, alias y procedencia de cada escala en su catálogo, evitando categorías culturales vagas.

## Tablatura

El panel contiene un motivo original de dos compases compatible con `Am/C → F`. Se identifica como referencia visual y no presenta un cursor de nota falso. Al llegar al interludio se actualiza la etiqueta del contexto. En la aplicación, la tablatura puede aparecer por sección o por demanda del usuario; su existencia no debe ser requisito para reproducir una canción.

## Accesibilidad y límites de esta entrega

Se usan botones, selects y controles nativos, etiquetas visibles, foco contrastante, enlace para saltar al prompter, regiones de estado para acciones y controles de expansión. El pulso visual deja de alternarse cuando está activo `prefers-reduced-motion`; el contador textual conserva la posición. Las alertas no parpadean. El cambio de cada pulso o acorde no se anuncia como mensaje urgente al lector de pantalla.

La maqueta reutiliza la organización conceptual ya presente en `public/index.html` y `public/css/stage.css`: escenario, acorde actual, escala, diapasón, tablatura y tamaño de letra. Evita acoplarse a su implementación y no modifica los archivos ejecutables de la aplicación. Tampoco afirma que el seguimiento automático por audio, MIDI o pedal ya esté disponible.

Validación realizada al autorar: el JavaScript embebido supera un análisis sintáctico con Node y no hay IDs HTML duplicados. La revisión visual del archivo debe acompañar su presentación; la verificación completa con teclado, zoom, lector de pantalla y monitores de escenario corresponde a las etapas de validación del plan.
