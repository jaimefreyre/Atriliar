import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNearestExpected, matchOnsets } from '../../public/js/audio/onsetMatcher.js';

test('empareja ataques dentro de tolerancia y calcula desvío y precisión', () => {
  const report = matchOnsets([1040, 1980, 2400], [1000, 2000], { toleranceMs: 80 });
  assert.equal(report.matches.length, 2);
  assert.deepEqual(report.falsePositives, [2400]);
  assert.equal(report.meanAbsoluteErrorMs, 30);
  assert.equal(report.meanSignedErrorMs, 10);
  assert.equal(report.precision, 2 / 3);
  assert.equal(report.recall, 1);
});

test('un target solo puede emparejarse con un ataque', () => {
  const report = matchOnsets([995, 1005], [1000], { toleranceMs: 20 });
  assert.equal(report.matches.length, 1);
  assert.equal(report.falsePositives.length, 1);
  assert.equal(report.missed.length, 0);
});

test('ataques desviados y targets ausentes quedan separados', () => {
  const report = matchOnsets([1500], [1000, 2000], { toleranceMs: 100 });
  assert.deepEqual(report.falsePositives, [1500]);
  assert.deepEqual(report.missed, [1000]);
  assert.equal(report.f1, 0);
});

test('los targets futuros solo cuentan como omitidos cuando el reloj los supera', () => {
  const report = matchOnsets([1500], [1000, 2000], { toleranceMs: 100, throughMs: 2100 });
  assert.deepEqual(report.missed, [1000, 2000]);
});

test('encuentra el pulso conocido más cercano', () => {
  assert.equal(findNearestExpected([0, 500, 1000], 730), 500);
  assert.equal(findNearestExpected([], 300), null);
});

test('rechaza tolerancias inválidas', () => {
  assert.throws(() => matchOnsets([], [], { toleranceMs: -1 }), RangeError);
});
