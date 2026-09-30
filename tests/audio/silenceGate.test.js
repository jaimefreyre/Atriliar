import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSilenceFrames, summarizeSilenceWindow } from '../../public/js/audio/silenceGate.js';
import { buildHarmonicRegions } from '../../public/js/audio/harmonicSegmentation.js';

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

test('beat windows suppress chord proposals when most analyzed frames are silent', () => {
  const frames = [{ isSilence: true }, { isSilence: true }, { isSilence: true }, { isSilence: false }];
  const result = summarizeSilenceWindow(frames);
  assert.equal(result.isSilence, true);
  assert.equal(result.activeFrames.length, 0);
});

test('a one- or two-frame transient cannot create a chord proposal in a quiet beat', () => {
  const frames = [{ isSilence: true }, { isSilence: false }, { isSilence: false }, { isSilence: true }, { isSilence: true }];
  const result = summarizeSilenceWindow(frames);
  assert.equal(result.isSilence, true);
  assert.equal(result.activeFrames.length, 0);
});

test('harmonic map preserves a labeled silence between two chords', () => {
  const frames = makeFrames([['C', 24], ['silence', 8], ['G', 24]]);
  const regions = buildHarmonicRegions(frames, 2800, 120);
  assert.deepEqual(regions.map((region) => region.isSilence), [false, true, false]);
  assert.equal(regions[0].symbol, 'C');
  assert.equal(regions[1].symbol, null);
  assert.equal(regions[1].state, 'silence');
  assert.equal(regions[1].confidence, 0);
  assert.deepEqual(regions[1].chroma, Array(12).fill(0));
  assert.equal(regions[1].spectralPeaks.length, 0);
  assert.equal(regions[2].symbol, 'G');
  assert.equal(regions[0].endMs, regions[1].startMs);
  assert.equal(regions[1].endMs, regions[2].startMs);
});
