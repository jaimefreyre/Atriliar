import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHarmonicRegions } from '../../public/js/audio/harmonicSegmentation.js';

const profiles = {
  C: { chroma: [1, 0, 0, 0, .85, 0, 0, .8, 0, 0, 0, 0], peaks: [48, 52, 55, 60, 64] },
  'C/E': { chroma: [1, 0, 0, 0, .85, 0, 0, .8, 0, 0, 0, 0], peaks: [40, 52, 55, 60, 64] },
  G: { chroma: [0, 0, .8, 0, 0, 0, 0, 1, 0, 0, 0, .85], peaks: [43, 47, 50, 55, 59] },
};

function makeFrames(sequence) {
  const frames = [];
  sequence.forEach(([symbol, count]) => {
    const profile = profiles[symbol];
    for (let index = 0; index < count; index++) {
      frames.push({
        timeSec: frames.length * .05,
        chroma: profile.chroma,
        spectralPeaks: profile.peaks.map((midi, peakIndex) => ({ midi, magnitude: 1 - peakIndex * .12 })),
      });
    }
  });
  return frames;
}

test('sustained chord and harmonic-peak changes create adjacent, non-overlapping regions', () => {
  const frames = makeFrames([['C', 22], ['G', 22]]);
  const regions = buildHarmonicRegions(frames, 2200, 120);
  assert.equal(regions.length, 2);
  assert.equal(regions[0].symbol, 'C');
  assert.equal(regions[1].symbol, 'G');
  assert.ok(regions[1].startMs >= 950 && regions[1].startMs <= 1350);
  assert.equal(regions[0].endMs, regions[1].startMs);
  assert.equal(regions[0].startMs, 0);
  assert.equal(regions[1].endMs, 2200);
});

test('brief chromatic transients do not create a harmonic region', () => {
  const frames = makeFrames([['C', 18], ['G', 2], ['C', 20]]);
  const regions = buildHarmonicRegions(frames, 2000, 120);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].symbol, 'C');
});

test('legacy pulse snapshots can be resegmented at a sustained chord change', () => {
  const frames = makeFrames([['C', 3], ['G', 3]]).map((frame, index) => ({
    ...frame,
    timeSec: index * .5,
  }));
  const regions = buildHarmonicRegions(frames, 3000, 120, {
    smoothingMs: 1, minSmoothingFrames: 1, changeConfirmMs: 1, minChangeFrames: 1,
    minRunFrames: 1, minRegionMs: 280, minScore: 0.48, minMargin: 0.025,
  });
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((region) => region.symbol), ['C', 'G']);
});

test('saved beat snapshots still expose harmonic changes with production smoothing', () => {
  const frames = makeFrames([['C', 6], ['G', 6]]).map((frame, index) => ({
    ...frame,
    timeSec: index * .5,
  }));
  const regions = buildHarmonicRegions(frames, 6000, 120);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((region) => region.symbol), ['C', 'G']);
});

test('mantiene como tentativa la propuesta cercana si el margen no alcanza para confirmarla', () => {
  const chroma = [1, .26, 1, .1, .69, .1, .24, .27, .22, .26, .41, .34];
  const frames = Array.from({ length: 24 }, (_, index) => ({ timeSec: index * .05, chroma, spectralPeaks: [] }));
  const [region] = buildHarmonicRegions(frames, 1200, 120);
  assert.equal(region.symbol, 'Csus2');
  assert.equal(region.accepted, false);
  assert.ok(region.confidence > .5);
});

test('a sustained bass inversion splits a region even when the chord name stays the same', () => {
  const frames = makeFrames([['C', 18], ['C/E', 18]]);
  const regions = buildHarmonicRegions(frames, 1800, 120);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((region) => region.symbol), ['C', 'C']);
  assert.equal(regions[1].evidence.bassChanged, true);
});
