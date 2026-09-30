import test from 'node:test';
import assert from 'node:assert/strict';
import { loopRecordingSlice } from '../../public/js/audio/loopRecording.js';

test('an open A–B take replaces one timeline clip with the latest loop pass', () => {
  const firstPass = loopRecordingSlice({ elapsedSongMs: 10000, recordStartMs: 0, loopStartMs: 0, loopEndMs: 10000 });
  const nextPass = loopRecordingSlice({ elapsedSongMs: 12750, recordStartMs: 0, loopStartMs: 0, loopEndMs: 10000 });

  assert.deepEqual(firstPass, { startMs: 0, sourceStartMs: 0, durationMs: 10000, captureRate: 1, lapNumber: 1 });
  assert.deepEqual(nextPass, { startMs: 0, sourceStartMs: 10000, durationMs: 2750, captureRate: 1, lapNumber: 2 });
});

test('a take started mid-loop records the first remainder, then rewrites from A', () => {
  const slice = loopRecordingSlice({ elapsedSongMs: 5200, recordStartMs: 5800, loopStartMs: 0, loopEndMs: 10000 });

  assert.deepEqual(slice, { startMs: 0, sourceStartMs: 4200, durationMs: 1000, captureRate: 1, lapNumber: 2 });
});

test('slowed loop capture points at its recording offset and compensates playback rate', () => {
  const slice = loopRecordingSlice({ elapsedSongMs: 8000, recordStartMs: 0, loopStartMs: 0, loopEndMs: 4000, playbackRate: .5 });

  assert.deepEqual(slice, { startMs: 0, sourceStartMs: 8000, durationMs: 4000, captureRate: 2, lapNumber: 2 });
});

test('disabling A–B grows the take from its start instead of replacing passes', () => {
  const slice = loopRecordingSlice({ elapsedSongMs: 2300, recordStartMs: 1250, loopStartMs: 500, loopEndMs: 6000, playbackRate: 1.25, loopEnabled: false });

  assert.deepEqual(slice, { startMs: 1250, sourceStartMs: 0, durationMs: 2300, captureRate: .8, lapNumber: 1 });
});
