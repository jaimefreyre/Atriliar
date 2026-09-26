# Contrato de canciones v2

Estado: especificación para construir; no cambia el runtime existente. La forma normativa está en [`song-v2.schema.json`](./song-v2.schema.json). [`demo-original.song.json`](./demo-original.song.json) contiene letra original, 32 segundos y tiempos de demostración, sin material de terceros.

## Decisiones de alcance

- Una canción es un documento JSON portable, sin HTML, código, audio embebido, secretos ni configuración de interfaz.
- Todos los tiempos persistidos son milisegundos enteros en una única línea de tiempo global. `startMs` es inclusivo; `endMs` es exclusivo: `[startMs, endMs)`.
- El MVP usa un BPM y un compás fijos. BPM significa **negras por minuto**, también en 6/8. Un BPM no documentado requiere un dato del usuario o una hipótesis de ensayo que el usuario haya elegido expresamente.
- La base genérica marca el pulso y, opcionalmente, el acento de compás. No inventa una grabación, melodía ni arreglo completo.
- Letras, acordes y tablaturas son eventos separados. El acorde activo depende del tiempo; su posición visual sobre una sílaba depende de un ancla de texto. Mover la pantalla no modifica el acorde activo.
- No hay arrays persistidos de beats, ticks ni posiciones de scroll que compitan con los milisegundos. Las divisiones de compás se calculan para editar o reproducir.
- El archivo lleva referencias de procedencia, pero una URL no demuestra que su contenido haya sido verificado ni autoriza a copiar letras completas de terceros.

## Campos y significados

| Ruta | Contrato |
|---|---|
| `schemaVersion` | Siempre `2`. Otros números se rechazan con una explicación de versión incompatible. |
| `id` | Identificador estable, no un título. Letras ASCII, dígitos, punto, guion y guion bajo; comienza con letra o dígito. |
| `metadata.title` | Título no vacío. La validación semántica rechaza títulos compuestos solo por espacios. |
| `metadata.artist` | Texto; `""` significa desconocido. No reemplazar desconocidos por nombres inventados. |
| `metadata.key` | Tónica mayor/menor como `C`, `Eb`, `F#m`, `Am`, o `null` si no se conoce. Es la tonalidad general; una sección puede indicar una modulación mediante su propio `key`. |
| `metadata.bpm` | Número finito positivo, en negras/minuto. El MVP no soporta mapas de tempo. |
| `metadata.timeSignature` | Objeto `{numerator, denominator}`. El denominador es 1, 2, 4, 8, 16 o 32. |
| `durationMs` | Duración musical positiva de la canción, sin contar un count-in opcional de la interfaz. |
| `timing.status` | `estimated` mientras la temporización no fue revisada por una persona; `reviewed` solo tras revisión explícita. No certifica toda la teoría musical del documento. |
| `timing.method` | `grid` para una distribución según compases; `manual` para marcas humanas; `aligned` para un proceso de alineación real con evidencia temporal; `auto-analyzed` para una primera estimación derivada de análisis de audio y todavía no revisada. |
| `timing.notes` | Supuestos y limitaciones de temporización. Puede estar vacío si no hay nada que aclarar. |
| `audio` | `null` para base genérica, o `{assetId, offsetMs}` para un Blob local guardado por separado. No contiene URL remota ni ruta absoluta del equipo. |
| `sections[]` | `{id,type,label,key,startMs,endMs}`. `key` string usa la misma notación tonal de metadata; `null` hereda `metadata.key` y nunca hereda accidentalmente la sección anterior. Tipos cerrados: `intro`, `verse`, `prechorus`, `chorus`, `bridge`, `solo`, `instrumental`, `outro`, `other`. Las repeticiones se expanden con IDs distintos. |
| `lines[]` | `{id,sectionId,startMs,endMs,text,tokens}`. `text` es texto plano. Una sección instrumental puede tener cero líneas. |
| `lines[].tokens[]` | `{text,startMs,endMs,charStart,charEnd}`. Opcionalidad expresada por `tokens: []`; el campo siempre existe. Sin tiempos fiables de palabra, usar el resaltado de línea. |
| `chords[]` | `{id,startMs,endMs,symbol,bassNote,anchor,scale}`. No obliga a tener letra; es válido un arreglo instrumental. |
| `chords[].symbol` | Cifrado tal como `Am`, `Cmaj7`, `G7(b13)`, `C/E`. Cadena corta sin espacios; preservar cifrados legacy hasta normalización revisada. |
| `chords[].bassNote` | Nota explícita de bajo o `null`. Si el cifrado lleva `/E`, el campo debe ser `E`; sin bajo indicado puede ser `null` y el panel usa la raíz como valor derivado. |
| `chords[].anchor` | `null` o `{lineId,charOffset}`. Ubicación visual del acorde sobre el texto; nunca es un tiempo ni una fracción de compás. |
| `chords[].scale` | `null` o `{root,id}`. Elección explícita de escala; no implica que una IA pueda deducir la escala correcta únicamente por el símbolo del acorde. |
| `tabs[]` | `{id,sectionId,startMs,endMs,label,ascii}`. Tablatura estática de guitarra de seis cuerdas EADGBE en el MVP; la primera fila es la cuerda aguda. La ventana temporal activa un bloque, no notas individuales. |
| `sources[]` | `{url,title,retrievedAt}`. URL HTTP(S); `title` es el título conocido o `""`; `retrievedAt` es fecha ISO 8601 real de consulta con zona horaria o `null` si no se conoce. Nunca inventar estos metadatos al migrar un enlace. `[]` para una composición original sin referencias externas. |
| `reviewWarnings[]` | Advertencias legibles y específicas, sin duplicados. No sustituye errores estructurales ni permite importar datos inválidos. |

Todos los objetos tienen `additionalProperties: false`. Todos sus campos definidos son obligatorios; la ausencia de datos se expresa con `null`, `[]` o la cadena vacía únicamente donde el esquema lo permite. Esto evita variantes incompatibles como `bpm: "120"`, `originalKey` dentro de v2 o `timeSignature: "4/4"`.

### Historial de cambios del contrato

- **v2 additive — `auto-analyzed`:** habilita borradores cuyos BPM, pulsos o acordes iniciales se estimaron desde un archivo de audio. Mantiene `timing.status: "estimated"`; no implica alineación exacta ni revisión musical.

## Validación semántica obligatoria

Ajv con soporte Draft 2020-12 y validación de formatos comprueba la estructura. Una segunda pasada pura comprueba relaciones que el esquema estándar no expresa por sí solo. La importación es atómica: ningún documento inválido ni sus activos se persisten parcialmente.

1. Todos los números son finitos y seguros para JavaScript. Los milisegundos e índices deben ser enteros seguros, sin coerción de cadenas. Todos los eventos cumplen `0 <= startMs < endMs <= durationMs`.
2. IDs únicos dentro de cada colección; IDs de sección, línea, acorde y tab se recomiendan globalmente distintos por claridad. Cada `sectionId` y `lineId` referenciado existe exactamente una vez.
3. Arrays cronológicos por `startMs`; ante empates en colecciones donde se permitan, orden estable por ID. Las secciones forman una partición completa de `[0,durationMs)` sin huecos ni solapamientos. Los silencios o pasajes sin voz pertenecen a una sección explícita.
4. Las líneas quedan íntegramente dentro de su sección y no se solapan entre sí. Pueden tener huecos: se muestra `INSTRUMENTAL` o la anticipación correspondiente, sin atribuir voz a esos intervalos.
5. Los acordes no se solapan: hay como máximo un contexto armónico activo. Un acorde puede cruzar un límite de línea o sección. Un hueco de acordes significa que no hay acorde indicado; el renderer no prolonga el anterior por adivinación.
6. Cada ancla cumple `0 <= charOffset < line.text.length`, coincide con un límite de grafema y el inicio del acorde está dentro del intervalo de esa línea. El acorde puede continuar después de que termine esa línea. No permitir anclas sobre una línea vacía.
7. Tokens dentro del intervalo de su línea, en orden temporal y de texto, sin solapamientos. Cumplen `0 <= charStart < charEnd <= text.length` y `line.text.slice(charStart,charEnd) === token.text`. Si existen, cubren todo carácter no blanco de la línea exactamente una vez; los espacios pueden quedar entre tokens. No partir pares sustitutos ni grafemas. Si no se puede cumplir, usar `[]`.
8. Los offsets de caracteres son **unidades de código UTF-16**, como `String.prototype.slice` de JavaScript, con inicio 0 y final exclusivo. No son bytes, puntos de código ni posiciones visuales. No normalizar acentos ni modificar el texto después de calcularlos sin regenerar offsets. Ejemplo: en `Sol 🎸 hoy`, `hoy` ocupa `[7,10)` y el emoji `[4,6)`; un índice 5 sería inválido como límite de grafema.
9. `bassNote` debe concordar con el bajo del cifrado cuando éste tiene slash. Para comparar enarmonías se usan clases de altura; se conserva la ortografía musical al mostrar. Un símbolo que el motor actual no pueda interpretar debe quedar como texto con advertencia explícita y con el panel teórico desactivado para ese acorde: jamás inventar notas.
10. Una escala no nula debe referenciar un ID presente en el catálogo versionado de la aplicación. Un ID desconocido bloquea importación; ofrecer corregirlo o reemplazarlo explícitamente por `null`. El renderer también mantiene un fallback defensivo si encuentra datos antiguos corruptos. No elegir una escala por coincidencia parcial de nombre.
11. Cada tab queda dentro de su sección; en MVP no se solapan bloques de tablatura. Su ASCII conserva saltos de línea y se presenta mediante texto, nunca interpretado como HTML. Si está vacío o no es una tab soportada, corregir o retirar el bloque. Afinaciones alternativas y seguimiento nota a nota requieren ampliar el contrato deliberadamente.
12. `timing.status: reviewed` exige una acción humana en el editor; importar una afirmación de revisión de una fuente externa no debe generar automáticamente una marca de confianza local. Guardar la revisión local en `settings`, clave `review:<songId>`, con el hash de una serialización canónica del documento revisado. Solo se considera revisado localmente mientras ese hash coincide; una edición o reemplazo invalida la confianza hasta nueva revisión. No requiere otro store ni otro campo dentro de SongDocument.

Los errores de estructura y referencias se muestran por ruta (`lines[2].tokens[1].charEnd`) junto con una corrección concreta. Las advertencias de calidad son visibles antes de entrar a escenario. En ensayo se permite karaoke con tokens estimados válidos, siempre con la etiqueta `TEMPORIZACIÓN ESTIMADA`. En escenario, por defecto se resalta la línea completa hasta la revisión local; después pueden usarse los tokens. El indicador del estado de temporización permanece visible en ambos modos.

## Cálculo de tiempo, base genérica y audio

El editor deriva la cuadrícula mediante:

```text
quarterMs = 60000 / bpm
meterUnitMs = quarterMs * 4 / denominator
barMs = meterUnitMs * numerator
boundaryMs(n) = round(n * barMs)
```

Redondear cada límite a partir del origen; no acumular duraciones redondeadas de compases. A 120 negras/minuto, 4/4 dura 2000 ms por compás y 6/8 dura 1500 ms. Para subdivisiones se aplica el mismo criterio.

En base genérica, cambiar el tempo de ensayo modifica una razón local `rate = requestedBpm / metadata.bpm`. El reloj transforma tiempo real en `songMs`; **no reescribe** los eventos. La duración real restante es `(durationMs - songMs) / rate`. Volver a 1 restaura el tempo guardado. Exportar la canción conserva su cuadrícula original, salvo edición explícita de toda la temporización.

En audio, el MVP reproduce a velocidad 1 y bloquea la edición del BPM durante la reproducción. Relación normativa:

```text
mediaMs = songMs + audio.offsetMs
songMs = mediaMs - audio.offsetMs
```

`offsetMs >= 0` permite omitir silencio o una cuenta inicial grabada. La canción de 32 000 ms con `offsetMs: 2000` ocupa el archivo entre 2000 y 34 000 ms. No se soportan offsets negativos ni preroll de silencio en este MVP: corregir el origen temporal en el editor o preparar otro archivo. Al vincular, verificar duración y acceso al Blob; si el audio no cubre el tramo requerido, bloquear esa vinculación con diagnóstico, no truncar el final silenciosamente.

`audio: null` selecciona base genérica; un `assetId` ausente no cambia de modo a escondidas. La interfaz debe pedir volver a vincular el archivo o cambiar explícitamente a base genérica. El audio se guarda en un store `assets`, referenciado por ID. La exportación JSON no incluye el Blob: transportar la canción a otro navegador requiere volver a vincular el audio. No almacenar object URLs, porque su vida útil es temporal.

## Catálogo de escalas y teoría derivada

Los nombres visibles son traducibles; los IDs son estables. Catálogo inicial acordado:

`ionian`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `aeolian`, `locrian`, `major-pentatonic`, `minor-pentatonic`, `major-blues`, `minor-blues`, `dominant-bebop`, `major-bebop`, `minor-bebop`, `harmonic-minor`, `melodic-minor`, `double-harmonic-major`, `hungarian-minor`, `phrygian-dominant`, `hirajoshi`, `kumoi`, `kumoijoshi`, `whole-tone`, `diminished-half-whole`, `diminished-whole-half`, `augmented`.

El catálogo guarda intervalos y alias, fuera de cada canción. `double-harmonic-major` se presenta como “Doble armónica mayor”, con “árabe” únicamente como alias de una convención occidental. No representa toda la música árabe ni sus sistemas microtonales. Los patrones de 12 semitonos del MVP son una limitación explícita. Las etiquetas japonesas se distinguen por intervalos y tradición de nomenclatura: `hirajoshi [0,2,3,7,8]`, `kumoi [0,2,3,7,9]`, `kumoijoshi [0,1,5,7,8]`; no igualar sus nombres por parecido.

Notas, grados, tensiones, ubicaciones en el diapasón y la raíz/bajo derivados no se duplican en el JSON de canción. Se calculan desde el acorde, escala y configuración local de guitarra. Transponer en pantalla no debe alterar silenciosamente el audio ni sugerir que éste cambió de tonalidad.

## Migración del formato existente

Evidencia revisada: `public/js/data/songValidator.js` valida título/BPM/estructura y posiciones sobre `lyrics`; no valida tiempo. `public/js/rendering/chordTracker.js` obtiene el acorde por geometría del DOM y posición de scroll. La fixture `public/fixtures/songs/all-verses.json` contiene `originalKey`, compás string, secciones anidadas, `lyrics` y acordes `{chord,position}`. Su tercera sección tiene tonalidad `F`, distinta del `C` global. Nada de eso contiene una duración sincronizada real.

Mantener `StagePrompterDB`; aumentar su versión estructural a 2 creando `songsV2`, `assets`, `setlists` y `settings`. Conservar `songs` original intacto durante la migración. La versión de IndexedDB y `schemaVersion` son conceptos distintos aunque aquí ambos sean 2. No convertir canciones ni esperar interacciones dentro de `onupgradeneeded`: esa transacción solo cambia stores. El asistente de migración opera después de abrir la base.

| Legacy | Destino / regla |
|---|---|
| `id` | Conservar si es válido y no colisiona; si no, generar ID nuevo y registrar la relación en el informe de migración. |
| `metadata.originalKey` | `metadata.key`; validar/normalizar con confirmación si hay ambigüedad, `null` si falta. |
| `metadata.timeSignature: "4/4"` | `{numerator:4,denominator:4}` tras parseo estricto. |
| `structure[]` | Secciones planas, IDs deterministas como `section-001`, tipos normalizados; tipo desconocido a `other`, conservando `label`. |
| `structure[].lines[].lyrics` | `lines[].text`, conservando exactamente caracteres y espacios. |
| `line.chords[].chord` | `chords[].symbol`; no reescribir `F7M(9)` sin revisar equivalencia. |
| `line.chords[].position` | `anchor.charOffset`, jamás `startMs`. El validador legacy acepta `position === lyrics.length`; en v2 corregir a un grafema válido o quitar el ancla explícitamente, sin truncar a escondidas. |
| `structure[].key` | `sections[].key`, conservando modulaciones como C→F de la fixture. Si falta, `null` hereda metadata. Un cambio de tonalidad no cambia automáticamente los símbolos ni autoriza a deducir escalas. |
| `references.youtube_*` | Copiar cada URL HTTP(S) no vacía a `sources`. Si título/consulta son desconocidos, usar `title:""` y `retrievedAt:null`, con advertencia de referencia no verificada. Mantener el campo de origen en el respaldo/informe. Nunca se convierten en el Blob de audio. |
| `lines[].tab[]` legacy | Convertir a `tabs[].ascii` tras confirmar la convención de cuerdas; conservar el array original en el respaldo/informe. En v2 la fila superior es primera cuerda E4. El renderer legacy usa `6 - note.string` y coloca `string:1` abajo pese a sus etiquetas; no invertir automáticamente los datos ni asumir la intención de esos arreglos. Pedir revisión y recién entonces asignar tiempos del bloque. |

Conservar las tres referencias `youtube_studio`, `youtube_live` y `youtube_tutorial` en `sources` cuando contienen una URL válida, además de respaldo e informe, aunque el editor histórico deje vacía la tercera al guardar. Un campo vacío no genera un objeto fuente vacío. No sustituir una referencia histórica por una fecha de consulta que nunca ocurrió. Hay dos archivos de Estadio Azteca con el mismo `id`: el asistente debe mostrar la colisión y permitir copia con ID nuevo o reemplazo deliberado, sin usar `put()` a ciegas.

Secuencia del asistente:

1. Exportar respaldo JSON del documento original y mostrar qué datos requieren completar. La operación no borra ni sobrescribe el legacy.
2. Pedir duración o compases por línea/sección y confirmar BPM/compás. Si el usuario elige expresamente “2 compases por línea”, usar esa hipótesis, marcada como estimada; no asumirla en silencio. Reservar intro, solos y silencios que el usuario indique.
3. Calcular intervalos globales. Ofrecer una regla explícita de reparto de acordes por compás/subdivisión o marcas manuales. La distancia en caracteres no es evidencia de duración musical. Conservar `tokens: []` cuando no hay marcas de palabra.
4. Poner `timing: {status:"estimated",method:"grid",notes:"...supuestos aceptados..."}`, `audio:null`, `scale:null` por defecto y registrar advertencias. Resolver campos no soportados en un informe de migración; no descartarlos sin informar.
5. Validar esquema e invariantes. Mostrar previsualización con original al lado; guardar en `songsV2` solo tras la acción de guardar del usuario. Mantener operación idempotente: volver a abrir el asistente no duplica una migración completada.
6. Ensayar con la base, corregir marcas y confirmar revisión. Vincular un audio local después no transforma una cuadrícula estimada en alineación precisa.

## Tipado y casos de aceptación

Se conserva JavaScript. Planificar tipos JSDoc derivados de este contrato y comprobación `checkJs`/`tsc --noEmit`; no exigir una migración a TypeScript. El tipado estático ayuda al desarrollador, pero no valida archivos externos: Ajv y la pasada semántica siguen siendo obligatorios.

Casos mínimos: la demo carga y termina en 32 000 ms; un campo extra se rechaza; un compás string se deriva al importador legacy y no pasa por v2; un token que parte `🎸` se rechaza; una ancla huérfana se rechaza; dos acordes solapados se rechazan; `scale.id` desconocido exige corrección; un intervalo que acaba después de la canción se rechaza; una fuente con fecha inválida se rechaza; un offset negativo se rechaza; un Blob ausente pide revincular; en `songMs === endMs` ya no queda activo el evento anterior. Un documento instrumental con `lines: []`, `chords` temporizados y secciones válidas se acepta.

### Verificación de los artefactos de esta entrega

Se validó la demo contra el esquema con Ajv CLI, `--spec=draft2020` y `ajv-formats`: resultado **valid**. Una comprobación independiente en Node verificó objetos cerrados recursivamente, IDs, partición de secciones, intervalos, referencias, anclas, límites de grafemas UTF-16 y cobertura de tokens. No se instaló una dependencia en el proyecto ni se implementó el validador de producción. Los casos de aceptación anteriores son requisitos para esa implementación posterior.

Comando reproducible desde la raíz del proyecto:

```powershell
npx --yes --package=ajv-cli --package=ajv-formats ajv validate --spec=draft2020 -c ajv-formats -s docs/spec-v2/contratos/song-v2.schema.json -d docs/spec-v2/contratos/demo-original.song.json
```
