import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostBeatWindows } from '../../public/js/audio/beatHarmony.js';

test('builds one harmonic reanalysis slice per rhythmic beat and skips the attack', () => {
  const frames = [0, .05, .1, .15, .2, .25, .3, .35, .4, .45, .5, .55, .6, .65, .7, .75]
    .map((timeSec) => ({ timeSec, chroma: Array(12).fill(0) }));
  const windows = buildPostBeatWindows(frames, [0, .4], 800, { settleMs: 100 });
  assert.equal(windows.length, 2);
  assert.deepEqual(windows.map(({ startMs, endMs }) => [startMs, endMs]), [[0, 400], [400, 800]]);
  assert.equal(windows[0].analysisStartMs, 100);
  assert.equal(windows[0].transientSkippedMs, 100);
  assert.equal(windows[1].analysisStartMs, 500);
});

test('falls back to a shorter attack exclusion for fast beats with sparse FFT frames', () => {
  const frames = [.0, .046, .092, .138, .184, .23, .276, .322].map((timeSec) => ({ timeSec }));
  const windows = buildPostBeatWindows(frames, [0, .12, .24], 360, { settleMs: 90, minimumFrames: 2 });
  assert.equal(windows.length, 3);
  assert.ok(windows.every((window) => window.frames.length >= 2));
  assert.ok(windows.every((window) => window.transientSkippedMs < 90));
});
