# C12 — seguimiento de audio y karaoke armónico en vivo

## Resultado

El mapa del asistente sigue el reproductor local: mueve el cursor de tiempo y enfoca automáticamente el tramo que está sonando. El mapa añade líneas de pulsos detectados y marcas de compás según una agrupación configurable entre 2 y 12 pulsos. Esto es una guía visual: si la estimación de BPM o el punto inicial de pulso está corrido, la cuadrícula también puede estarlo.

El panel «Karaoke de análisis en vivo» agrega una escucha opcional por micrófono. Solo comienza al pulsar **Iniciar escucha por micrófono**. El micrófono y el archivo se analizan en Workers locales; la señal del micrófono no se graba ni se envía. Mientras corre la pista, el panel presenta:

- tramo y acorde de referencia (elección manual o propuesta automática marcada como no confirmada);
- acorde más parecido por croma estimado en la entrada del micrófono;
- afinidad coseno entre los perfiles de croma captado y de referencia, suavizada en el tiempo con una indicación de tendencia;
- proporción de energía de croma captado que cae en las notas del acorde si el músico lo eligió;
- secuencia de referencia desde el acorde anterior;
- superposición de las notas graves o altas del micrófono en la vista global elegida.

Para comparar conviene usar auriculares. Si el micrófono recibe también la pista que suena por altavoces, puede puntuar la referencia que se filtra en vez de lo que toca el músico. Una voz cantando una sola nota no necesariamente contiene información para reconocer un acorde completo.

## Interpretación y límites

La afinidad de croma compara distribución aproximada de clases de altura; **no** reconoce letra cantada, instrumento, digitación ni ejecución correcta. La clasificación de acordes de entrada es una sugerencia polifónica exploratoria, no una transcripción certificada. La tendencia indica si la similitud de croma reciente sube o baja frente al análisis de la pista, no una nota artística ni una decisión de aprobado/reprobado. Se pausa el resultado cuando la señal es baja o está saturada.

Los pulsos por beat y agrupación visual no constituyen un compás confirmado: el usuario puede ajustar cuántos pulsos agrupar. Tempo y comienzo del pulso todavía deben revisarse para cada canción.

## Validación

- El asistente se probó en navegador en `localhost:3000` con una base sintética local a 120 BPM y cambios C–G–F–C. Mostró los tramos por pulso, sugerencias, mapa de espectro y la agrupación visual de 2–12 pulsos.
- El panel karaoke apareció con referencia y transición propuestas para el primer tramo. Al intentar iniciar la escucha, el estado del navegador quedó en «Esperando permiso del micrófono…» y no entregó un stream; por ello no se pudo verificar el Worker de armonía en vivo ni puntajes reales.
- El avance visual durante reproducción tampoco quedó validado de extremo a extremo: la pestaña de prueba se cerró al iniciar reproducción en el navegador integrado.
- Las pruebas automatizadas cubren la similitud de croma; los módulos de navegador y Worker pasan comprobación sintáctica.
