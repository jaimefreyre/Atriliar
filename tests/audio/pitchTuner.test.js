import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchReadingAt } from '../../public/js/audio/pitchTuner.js';

const tracks = {
  bass: [{ startMs: 0, endMs: 1000, midi: 40, strength: .72, register: 'bass' }],
  middle: [{ startMs: 0, endMs: 1000, midi: 60, strength: .42, register: 'middle' }],
  high: [{ startMs: 0, endMs: 1000, midi: 69, strength: .9, register: 'high' }],
};

test('el afinador sigue una nota en el cursor y permite fijar el registro de bajo', () => {
  const frame = { timeMs: 400, peaks: [{ midi: 40, frequencyHz: 82.41, strength: .7 }, { midi: 69, frequencyHz: 442, strength: .9 }] };
  assert.equal(pitchReadingAt({ tracks, frames: [frame], timeMs: 450 }).note, 'A4');
  const bass = pitchReadingAt({ tracks, frames: [frame], timeMs: 450, register: 'bass' });
  assert.equal(bass.note, 'E2');
  assert.equal(bass.register, 'bass');
});

test('el afinador estima frecuencia y cents desde el pico espectral del mismo tono', () => {
  const reading = pitchReadingAt({ tracks, frames: [{ timeMs: 0, peaks: [{ midi: 69, frequencyHz: 442 }] }], timeMs: 0 });
  assert.equal(reading.note, 'A4');
  assert.equal(reading.frequencyHz, 442);
  assert.ok(reading.cents > 7 && reading.cents < 9);
});

test('el afinador no arrastra una nota anterior al silencio o a un hueco', () => {
  assert.deepEqual(pitchReadingAt({ tracks, frames: [], timeMs: 500, silence: true }), { kind: 'silence' });
  assert.equal(pitchReadingAt({ tracks, frames: [], timeMs: 1500 }), null);
});
