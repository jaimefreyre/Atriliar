import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveSection, getActiveLine, getActiveChord, getActiveToken,
  getAdjacentLines, getBlocks, getActiveBlock,
} from '../../public/js/timeline/selectors.js';

const song = {
  durationMs: 10000,
  sections: [
    { id: 's1', startMs: 0, endMs: 4000 },
    { id: 's2', startMs: 4000, endMs: 10000 },
  ],
  lines: [
    {
      id: 'l1', sectionId: 's2', startMs: 4000, endMs: 6000, text: 'Hola mundo',
      tokens: [
        { text: 'Hola', startMs: 4000, endMs: 5000, charStart: 0, charEnd: 4 },
        { text: 'mundo', startMs: 5000, endMs: 6000, charStart: 5, charEnd: 10 },
      ],
    },
    { id: 'l2', sectionId: 's2', startMs: 7000, endMs: 9000, text: 'Otra linea', tokens: [] },
  ],
  chords: [
    { id: 'c1', startMs: 0, endMs: 2000 },
    { id: 'c2', startMs: 2000, endMs: 4000 },
  ],
  tabs: [],
};

test('frontera exacta: un evento que termina en t deja de estar activo, uno que empieza en t se activa', () => {
  assert.equal(getActiveSection(song, 3999).id, 's1');
  assert.equal(getActiveSection(song, 4000).id, 's2');
});

test('semiabierto: nada activo en el instante exacto en que termina la canción', () => {
  assert.equal(getActiveSection(song, 10000), null);
});

test('línea activa respeta huecos instrumentales (6000-7000 sin línea)', () => {
  assert.equal(getActiveLine(song, 5500).id, 'l1');
  assert.equal(getActiveLine(song, 6500), null);
  assert.equal(getActiveLine(song, 8000).id, 'l2');
});

test('sin acorde activo tras el último evento: "—" en la UI, null aquí', () => {
  assert.equal(getActiveChord(song, 4500), null);
});

test('token activo por palabra dentro de una línea con tokens', () => {
  const line = getActiveLine(song, 4500);
  assert.equal(getActiveToken(line, 4500).text, 'Hola');
  assert.equal(getActiveToken(line, 5500).text, 'mundo');
});

test('token activo es null cuando la línea no tiene tokens (resaltado por línea, no por palabra)', () => {
  const line = getActiveLine(song, 8000);
  assert.equal(getActiveToken(line, 8000), null);
});

test('líneas adyacentes: anterior/actual/siguiente por índice, extremos son null', () => {
  const { prev, current, next } = getAdjacentLines(song, 8000);
  assert.equal(prev.id, 'l1');
  assert.equal(current.id, 'l2');
  assert.equal(next, null);
});

test('bloques intercalan instrumental/línea sin saltarse huecos', () => {
  const blocks = getBlocks(song);
  assert.deepEqual(blocks.map((b) => `${b.type}:${b.startMs}-${b.endMs}`), [
    'instrumental:0-4000',
    'line:4000-6000',
    'instrumental:6000-7000',
    'line:7000-9000',
    'instrumental:9000-10000',
  ]);
});

test('bloque activo consistente en avance y retroceso (seek arbitrario)', () => {
  const blocks = getBlocks(song);
  assert.equal(getActiveBlock(blocks, 500).type, 'instrumental');
  assert.equal(getActiveBlock(blocks, 4500).line.id, 'l1');
  assert.equal(getActiveBlock(blocks, 6500).type, 'instrumental');
  assert.equal(getActiveBlock(blocks, 8500).line.id, 'l2');
  // retroceder desde el final vuelve a seleccionar el mismo bloque que al avanzar
  assert.equal(getActiveBlock(blocks, 4500), getActiveBlock(blocks, 4500));
});
