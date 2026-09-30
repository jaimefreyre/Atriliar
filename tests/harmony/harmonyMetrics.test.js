import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLabel, wcsr, segmentationScores, boundaryScores, changesPerMinute, evaluateHarmony } from '../../public/js/harmony/harmonyMetrics.js';

const S = (symbol, startMs, endMs) => ({ symbol, startMs, endMs });
const reference = [S('C', 0, 4000), S('G', 4000, 8000)];

test('los vocabularios agrupan y excluyen como MIREX', () => {
  assert.equal(mapLabel('C7', 'majmin'), '0:maj');
  assert.equal(mapLabel('Am7', 'majmin'), '9:min');
  assert.equal(mapLabel('Csus4', 'majmin'), 'X');
  assert.equal(mapLabel('C/E', 'majmin_inv'), '0:maj/4');
  assert.equal(mapLabel('C', 'majmin_inv'), '0:maj/0');
  assert.equal(mapLabel('Cmaj7', 'sevenths'), '0:maj7');
  assert.equal(mapLabel('C6', 'sevenths'), 'X');
  assert.equal(mapLabel(null), 'N');
});

test('WCSR pondera por duración', () => {
  const estimate = [S('C', 0, 5000), S('G', 5000, 8000)];
  assert.equal(wcsr(reference, estimate, { durationMs: 8000 }), 7000 / 8000);
});

test('partir un acorde en dos baja la sobresegmentación, no la subsegmentación', () => {
  const split = [S('C', 0, 2000), S('Am', 2000, 4000), S('G', 4000, 8000)];
  const scores = segmentationScores(reference, split, { durationMs: 8000 });
  assert.equal(scores.overSegmentation, 1 - 2000 / 8000);
  assert.equal(scores.underSegmentation, 1);
});

test('no detectar un cambio baja la subsegmentación', () => {
  const merged = [S('C', 0, 8000)];
  const scores = segmentationScores(reference, merged, { durationMs: 8000 });
  assert.equal(scores.underSegmentation, 1 - 4000 / 8000);
  assert.equal(scores.overSegmentation, 1);
});

test('los límites se emparejan de a uno dentro de la tolerancia y cuentan cortes con el mismo nombre', () => {
  const estimate = [S('C', 0, 2000), S('C', 2000, 4100), S('G', 4100, 8000)];
  const result = boundaryScores(reference, estimate, { durationMs: 8000, toleranceMs: 250 });
  assert.equal(result.missed, 0);
  assert.equal(result.spurious, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.precision, 0.5);
});

test('cambios por minuto y silencio', () => {
  assert.equal(changesPerMinute([S('C', 0, 30000), S('G', 30000, 60000)], 60000), 1);
  const withSilence = [S('N', 0, 2000), S('C', 2000, 8000)];
  const report = evaluateHarmony(withSilence, [S(null, 0, 2000), S('C', 2000, 8000)], { durationMs: 8000 });
  assert.equal(report.noChordRecall, 1);
  assert.equal(report.wcsr.majmin, 1);
});
