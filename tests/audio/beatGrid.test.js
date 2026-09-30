import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBeatGrid } from '../../public/js/audio/beatGrid.js';

test('reconstruye una cuadrícula por BPM si ritmo devuelve pocos o ningún pulso', () => {
  assert.deepEqual(buildBeatGrid([], 2200, 120), [0, 0.5, 1, 1.5, 2, 2.2]);
  assert.deepEqual(buildBeatGrid([0.2], 1600, 120), [0, 0.5, 1, 1.5, 1.6]);
});

test('limpia pulsos inválidos, rellena huecos y limita el final a la duración', () => {
  assert.deepEqual(buildBeatGrid([NaN, -1, 0.1, 0.6, 2.6, 8], 3000, 120),
    [0, 0.1, 0.6, 1.1, 1.6, 2.1, 2.6, 3]);
});
