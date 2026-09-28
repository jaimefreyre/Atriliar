import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePitchTracker } from '../../public/js/audio/livePitchTracker.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

test('confirma una nueva nota solo después de persistir 280 ms', () => {
  const tracker = createLivePitchTracker({ confirmMs: 280, minConfidence: 0.2 });
  assert.equal(tracker.update(hz(69), 0.8, 0).current, null);
  assert.equal(tracker.update(hz(69), 0.8, 140).current, null);
  assert.equal(tracker.update(hz(69), 0.8, 280).current.midi, 69);
});

test('una nota débil o transitoria conserva la altura estable', () => {
  const tracker = createLivePitchTracker({ confirmMs: 280, minConfidence: 0.2 });
  for (const time of [0, 140, 280]) tracker.update(hz(69), 0.8, time);
  const changed = tracker.update(hz(71), 0.8, 420);
  assert.equal(changed.current.midi, 69);
  assert.equal(tracker.update(hz(71), 0.1, 500).current.midi, 69);
});

test('mantiene una nota durante una caída breve de confianza y luego la libera', () => {
  const tracker = createLivePitchTracker({ releaseMs: 350 });
  for (const time of [0, 140, 280]) tracker.update(hz(69), 0.8, time);
  assert.equal(tracker.update(0, 0, 500).current.midi, 69);
  assert.equal(tracker.update(0, 0, 700).current, null);
});
