import test from 'node:test';
import assert from 'node:assert/strict';
import { harteToSymbol, parseLabFile } from '../../public/js/harmony/labFormat.js';
import { mapLabel } from '../../public/js/harmony/harmonyMetrics.js';

test('las etiquetas Harte pasan a los símbolos de la app', () => {
  const cases = { 'C:maj': 'C', C: 'C', 'A:min': 'Am', 'G:7': 'G7', 'F:maj7': 'Fmaj7', 'D:min7': 'Dm7', 'B:hdim7': 'Bm7b5',
    'Bb:maj': 'Bb', 'F#:min': 'F#m', 'E:sus4': 'Esus4', 'C:maj6': 'C6', 'A:5': 'A5', N: 'N', X: 'X' };
  for (const [label, symbol] of Object.entries(cases)) assert.equal(harteToSymbol(label), symbol, label);
});

test('las inversiones por grado nombran el bajo y lo desconocido queda excluido', () => {
  assert.equal(harteToSymbol('C:maj/3'), 'C/E');
  assert.equal(harteToSymbol('A:min/b3'), 'Am/C');
  assert.equal(harteToSymbol('G:7/b7'), 'G7/F');
  assert.equal(harteToSymbol('Eb:maj/5'), 'Eb/Bb');
  assert.equal(harteToSymbol('C:maj/1'), 'C');
  assert.equal(harteToSymbol('C:(1,3,5,9)'), 'X');
  assert.equal(harteToSymbol('C:weird'), 'X');
  assert.equal(mapLabel(harteToSymbol('C:maj/3'), 'majmin_inv'), '0:maj/4');
});

test('un archivo .lab da segmentos en milisegundos e informa las líneas mal formadas', () => {
  const { segments, errors } = parseLabFile('0.000 0.500 N\n0.500 2.250 C:maj\n2.250 4.1 A:min7\nbasura\n# comentario\n');
  assert.deepEqual(segments.map(({ startMs, endMs, symbol }) => [startMs, endMs, symbol]), [[0, 500, 'N'], [500, 2250, 'C'], [2250, 4100, 'Am7']]);
  assert.deepEqual(errors.map((item) => item.line), [4]);
});
