import test from 'node:test';
import assert from 'node:assert/strict';
import { contextToPerfMs, mediaPositionAt, inputLatencyMsFor } from '../../public/js/audio/frameClock.js';

test('el tiempo del AudioContext pasa al reloj de la UI descontando la latencia de entrada', () => {
  assert.equal(contextToPerfMs(4900, { contextNowMs: 5000, perfNowMs: 20000 }), 19900);
  assert.equal(contextToPerfMs(4900, { contextNowMs: 5000, perfNowMs: 20000, inputLatencyMs: 12 }), 19888);
  assert.equal(contextToPerfMs(null, { contextNowMs: 5000, perfNowMs: 20000 }), null);
});

test('la posición de la canción en un instante pasado respeta la velocidad y la pausa', () => {
  assert.equal(mediaPositionAt(9800, { positionMs: 30000, perfNowMs: 10000 }), 29800);
  assert.equal(mediaPositionAt(9800, { positionMs: 30000, perfNowMs: 10000, playbackRate: 0.5 }), 29900);
  assert.equal(mediaPositionAt(9800, { positionMs: 30000, perfNowMs: 10000, playing: false }), 30000);
  assert.equal(mediaPositionAt(0, { positionMs: 100, perfNowMs: 10000 }), 0);
});

test('la latencia de entrada sale de la pista si el navegador la informa, o es 0', () => {
  assert.equal(inputLatencyMsFor({ getSettings: () => ({ latency: 0.01 }) }), 10);
  assert.equal(inputLatencyMsFor({ getSettings: () => ({}) }), 0);
  assert.equal(inputLatencyMsFor(null), 0);
});
