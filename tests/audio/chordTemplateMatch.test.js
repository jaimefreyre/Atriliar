import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchChordTemplate } from '../../public/js/audio/chordTemplateMatch.js';

test('un croma C-E-G favorece C mayor y expone score/margen', () => {
  const result = matchChordTemplate([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(result.symbol, 'C');
  assert.equal(result.accepted, true);
  assert.ok(result.score > 0.9);
  assert.ok(result.margin > 0.04);
  assert.equal(result.alternatives[0].symbol, 'C');
  assert.equal(result.alternatives.length, 6);
});

test('un vector vacío no inventa armonía', () => {
  assert.deepEqual(matchChordTemplate(Array(12).fill(0)), { symbol: null, score: 0, margin: 0, accepted: false });
});

test('valida la forma y valores de croma antes de comparar', () => {
  assert.throws(() => matchChordTemplate([1, 2]), RangeError);
  assert.throws(() => matchChordTemplate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1]), RangeError);
});
