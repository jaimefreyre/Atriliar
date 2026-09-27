import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChroma } from '../../public/js/audio/chromaSimilarity.js';

test('el mismo perfil armónico tiene afinidad máxima', () => {
  assert.equal(compareChroma([1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0]), 1);
});

test('perfiles de clases de altura disjuntos tienen afinidad cero', () => {
  assert.equal(compareChroma([1, ...Array(11).fill(0)], [0, 1, ...Array(10).fill(0)]), 0);
});

test('la afinidad queda indefinida si alguno de los perfiles es silencio', () => {
  assert.equal(compareChroma(Array(12).fill(0), Array(12).fill(1)), null);
});

test('rechaza cromas mal tipados', () => {
  assert.throws(() => compareChroma([1, 2], Array(12).fill(0)), TypeError);
});
