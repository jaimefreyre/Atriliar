import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuditionRange } from '../../public/js/audio/auditionRange.js';

test('extiende el tramo hasta el siguiente cambio de acorde', () => {
  const segments = [
    { startMs: 0, endMs: 500, symbol: 'C' },
    { startMs: 500, endMs: 1000, symbol: 'C' },
    { startMs: 1000, endMs: 1500, symbol: 'G' },
  ];
  assert.deepEqual(getAuditionRange(segments, 0), { startMs: 0, endMs: 1000, symbol: 'C' });
});

test('usa el acorde seleccionado y limita pasajes largos', () => {
  const segments = Array.from({ length: 20 }, (_, index) => ({
    startMs: index * 500, endMs: (index + 1) * 500, symbol: 'C',
  }));
  segments[0].selectedSymbol = 'Dm';
  assert.deepEqual(getAuditionRange(segments, 0), { startMs: 0, endMs: 500, symbol: 'Dm' });
  segments.slice(1).forEach((segment) => { segment.selectedSymbol = 'Dm'; });
  assert.deepEqual(getAuditionRange(segments, 1), { startMs: 500, endMs: 6500, symbol: 'Dm' });
});

test('sin propuesta extiende solo un pulso y un índice inválido no genera escucha', () => {
  const segments = [{ startMs: 0, endMs: 400 }, { startMs: 400, endMs: 800 }];
  assert.deepEqual(getAuditionRange(segments, 0), { startMs: 0, endMs: 400, symbol: null });
  assert.equal(getAuditionRange(segments, 2), null);
});
