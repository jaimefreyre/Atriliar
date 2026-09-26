import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreChordChroma } from '../../public/js/music/chromaMatch.js';

test('croma C-E-G coincide con las notas del acorde C', () => {
  const result = scoreChordChroma([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], 'C');
  assert.equal(result.withinChord, true);
  assert.equal(result.ratio, 1);
  assert.deepEqual(result.chordPitchClasses, [0, 4, 7]);
});

test('energía fuera del acorde reduce la proporción sin prometer nota o cuerda exacta', () => {
  const result = scoreChordChroma([1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0], 'C');
  assert.equal(result.ratio, 0.75);
  assert.equal(result.withinChord, true);
  const outside = scoreChordChroma([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'C');
  assert.equal(outside.withinChord, false);
});

test('un acorde con bajo slash acepta el pitch class escrito para el bajo', () => {
  const result = scoreChordChroma([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'C/D');
  assert.equal(result.withinChord, true);
  assert.deepEqual(result.chordPitchClasses, [0, 2, 4, 7]);
});

test('silencio y acorde sin calidad reconocida no producen un juicio positivo', () => {
  assert.equal(scoreChordChroma(Array(12).fill(0), 'C').status, 'low-signal');
  assert.equal(scoreChordChroma(Array(12).fill(1), 'Cfoo').status, 'unknown-chord');
  assert.equal(scoreChordChroma(Array(12).fill(1), 'Cfoo').withinChord, null);
});

test('valida longitud, finitud y rango de umbral', () => {
  assert.throws(() => scoreChordChroma([1, 2], 'C'), /12 energías/);
  assert.throws(() => scoreChordChroma([NaN, ...Array(11).fill(0)], 'C'), /12 energías/);
  assert.throws(() => scoreChordChroma(Array(12).fill(0), 'C', { minInChordRatio: 1.1 }), /umbrales/);
});
