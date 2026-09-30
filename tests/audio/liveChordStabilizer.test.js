import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveChordStabilizer } from '../../public/js/audio/liveChordStabilizer.js';

const cMajor = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const gMajor = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1];

test('confirma una propuesta solo después de sostenerse durante la ventana configurada', () => {
  const detector = createLiveChordStabilizer({ alpha: 0.18, confirmMs: 400 });
  assert.equal(detector.update(cMajor, 0).confirmed, null);
  assert.equal(detector.update(cMajor, 200).confirmed, null);
  assert.equal(detector.update(cMajor, 399).confirmed, null);
  assert.equal(detector.update(cMajor, 400).confirmed.symbol, 'C');
});

test('una propuesta nueva pasajera no reemplaza el acorde ya confirmado', () => {
  const detector = createLiveChordStabilizer({ alpha: 0.18, confirmMs: 400 });
  for (const time of [0, 100, 200, 300, 400]) detector.update(cMajor, time);
  const transient = detector.update(gMajor, 500);
  assert.equal(transient.confirmed.symbol, 'C');
});

test('un margen ambiguo no inicia ni confirma un cambio', () => {
  const detector = createLiveChordStabilizer({ alpha: 1, confirmMs: 400 });
  const ambiguous = [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  const result = detector.update(ambiguous, 0);
  assert.equal(result.proposal, null);
  assert.equal(result.confirmed, null);
});

test('el detector en vivo confirma un acorde menor séptima con contexto de bajo', () => {
  const detector = createLiveChordStabilizer({ alpha: 1, minScore: 0.38, minMargin: 0.02, confirmMs: 300 });
  const cMinor7 = Array(12).fill(0.01);
  [0, 3, 7, 10].forEach((pitch) => { cMinor7[pitch] = 1; });
  detector.update(cMinor7, 0, { bassPitchClass: 0, fundamentalPitchClass: 0 });
  const result = detector.update(cMinor7, 300, { bassPitchClass: 0, fundamentalPitchClass: 0 });
  assert.equal(result.confirmed.symbol, 'Cm7');
});
