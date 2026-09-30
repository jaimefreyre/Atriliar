import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisGrid, aggregateSteps } from '../../public/js/harmony/harmonySteps.js';

const beats = (bpm, count) => Array.from({ length: count }, (_, index) => (index * 60) / bpm);

test('un pulso por paso a tempo rápido y medio pulso cuando el pulso dura 450 ms o más', () => {
  const fast = buildAnalysisGrid({ beatsSec: beats(160, 16), bpm: 160, durationMs: 6000 });
  assert.equal(fast.kind, 'beats');
  assert.equal(fast.stepsPerBeat, 1);
  const slow = buildAnalysisGrid({ beatsSec: beats(100, 16), bpm: 100, durationMs: 9600 });
  assert.equal(slow.stepsPerBeat, 2);
  assert.equal(slow.steps[0].weight, 0.5);
  assert.equal(slow.steps[1].startMs, 300);
});

test('sin pulsos confiables usa una grilla fija de 250 ms', () => {
  const grid = buildAnalysisGrid({ beatsSec: [0, 0.5], bpm: 120, rhythmConfidence: 0.4, durationMs: 2000 });
  assert.equal(grid.kind, 'fixed');
  assert.equal(grid.steps.length, 8);
  assert.equal(grid.steps[1].startMs, 250);
});

test('un paso inicial diminuto se une al siguiente en vez de quedar suelto', () => {
  const grid = buildAnalysisGrid({ beatsSec: [0.05, 0.4, 0.75, 1.1, 1.45], bpm: 171, durationMs: 1800 });
  assert.ok(grid.steps[0].endMs - grid.steps[0].startMs >= 120);
  assert.equal(grid.steps[0].startMs, 0);
});

test('la mediana por paso ignora el ataque y el final del pulso', () => {
  const hopMs = 50;
  const count = 20;
  const treble = new Float32Array(count * 12);
  const bass = new Float32Array(count * 12);
  for (let index = 0; index < count; index++) {
    // Attack frames (first 90 ms of each 500 ms beat) carry a bright G; the body is C.
    const within = (index * hopMs) % 500;
    treble[index * 12 + (within < 90 ? 7 : 0)] = 1;
  }
  const grid = { steps: [{ startMs: 0, endMs: 500, weight: 1, beatIndex: 0 }, { startMs: 500, endMs: 1000, weight: 1, beatIndex: 1 }] };
  const steps = aggregateSteps({ hopMs, count, treble, bass }, grid);
  assert.equal(steps[0].treble[0], 1);
  assert.equal(steps[0].treble[7], 0);
  assert.ok(steps[1].frameCount >= 5);
});

test('marca la fracción silenciosa de cada paso', () => {
  const count = 20;
  const mask = Array.from({ length: count }, (_, index) => index >= 10);
  const grid = { steps: [{ startMs: 0, endMs: 500, weight: 1, beatIndex: 0 }, { startMs: 500, endMs: 1000, weight: 1, beatIndex: 1 }] };
  const steps = aggregateSteps({ hopMs: 50, count, treble: new Float32Array(count * 12), bass: new Float32Array(count * 12) }, grid, { silenceMask: mask });
  assert.equal(steps[0].silentFraction, 0);
  assert.equal(steps[1].silentFraction, 1);
});
