import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBarDurationMs, getGridTimes, getMeterUnitMs } from '../../public/js/timeline/grid.js';

test('4/4 a 120 BPM tiene compás de 2000 ms', () => {
  assert.equal(getBarDurationMs(120, { numerator: 4, denominator: 4 }), 2000);
  assert.equal(getMeterUnitMs(120, 4), 500);
});

test('6/8 a 120 negras/minuto tiene seis corcheas o 1500 ms', () => {
  assert.equal(getBarDurationMs(120, { numerator: 6, denominator: 8 }), 1500);
  assert.deepEqual(getGridTimes({ bpm: 120, timeSignature: { numerator: 6, denominator: 8 }, durationMs: 3000 }).times,
    [0, 500, 1000, 1500, 2000, 2500, 3000]);
});

test('redondea límites desde el origen, no suma fracciones redondeadas', () => {
  const result = getGridTimes({ bpm: 137, timeSignature: { numerator: 7, denominator: 8 }, durationMs: 5000 });
  assert.equal(result.times[0], 0);
  assert.equal(result.times[1], Math.round(60_000 / 137));
  assert.ok(result.times.at(-1) <= 5000);
});

test('rejects invalid tempo and duration', () => {
  assert.throws(() => getGridTimes({ bpm: 0, timeSignature: { numerator: 4, denominator: 4 }, durationMs: 1000 }), RangeError);
  assert.throws(() => getGridTimes({ bpm: 120, timeSignature: { numerator: 4, denominator: 4 }, durationMs: 0 }), RangeError);
});
