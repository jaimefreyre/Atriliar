import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaveformEnvelope } from '../../public/js/audio/waveformEnvelope.js';

test('resume amplitud por tramos sin guardar PCM completo en el mapa', () => {
  const envelope = buildWaveformEnvelope(new Float32Array([0, -0.5, 0.2, 1, 0, 0.25]), 3);
  assert.deepEqual(envelope, [0.5, 1, 0.25]);
  assert.deepEqual(buildWaveformEnvelope(new Float32Array(0)), []);
});
