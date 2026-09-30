import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSilenceFrames } from '../../public/js/audio/silenceGate.js';

const cMajor = [1, 0, 0, 0, .85, 0, 0, .8, 0, 0, 0, 0];
const gMajor = [0, 0, .8, 0, 0, 0, 0, 1, 0, 0, 0, .85];

function makeFrames(sequence) {
  const frames = [];
  for (const [kind, count] of sequence) {
    const silent = kind === 'silence';
    const chroma = kind === 'G' ? gMajor : cMajor;
    for (let index = 0; index < count; index++) {
      frames.push({
        timeSec: frames.length * .05,
        chroma: silent ? Array(12).fill(.25) : chroma,
        spectralPeaks: silent ? [{ midi: 65, magnitude: .02 }] : [48, 52, 55].map((midi) => ({ midi, magnitude: 1 })),
        rms: silent ? .0001 : kind === 'quiet-C' ? .02 : .2,
      });
    }
  }
  return frames;
}

test('RMS silence gate ignores residual chroma and spectral peaks but filters only sustained spans', () => {
  const frames = makeFrames([['C', 8], ['silence', 8], ['C', 2], ['C', 8]]);
  const { mask, thresholdRms } = detectSilenceFrames(frames);
  assert.ok(thresholdRms > .0001);
  assert.ok(mask.slice(8, 16).every(Boolean));
  assert.ok(mask.slice(16, 18).every((value) => !value), 'a short quiet dip should not be silence');
});

test('a quiet but audible chord remains active against louder audio elsewhere', () => {
  const frames = makeFrames([['C', 8], ['quiet-C', 8]]);
  const { mask } = detectSilenceFrames(frames);
  assert.ok(mask.every((value) => !value));
});
