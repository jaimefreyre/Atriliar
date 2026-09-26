import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAudioCoversRange } from '../../public/js/transport/audioTrack.js';

function fakeAudio(durationSec) {
  return { duration: durationSec };
}

test('un archivo que alcanza para offset+duración se acepta', () => {
  const r = checkAudioCoversRange(fakeAudio(40), 2000, 32000); // 34000ms requeridos, archivo de 40000ms
  assert.equal(r.ok, true);
  assert.equal(r.requiredMs, 34000);
  assert.equal(r.fileDurationMs, 40000);
});

test('un archivo exactamente del largo requerido se acepta (borde)', () => {
  const r = checkAudioCoversRange(fakeAudio(34), 2000, 32000);
  assert.equal(r.ok, true);
});

test('un archivo insuficiente se rechaza en vez de truncar en silencio', () => {
  const r = checkAudioCoversRange(fakeAudio(30), 2000, 32000); // requiere 34000, el archivo da 30000
  assert.equal(r.ok, false);
});

test('una duración de audio no finita (NaN, archivo corrupto) nunca se acepta', () => {
  const r = checkAudioCoversRange(fakeAudio(NaN), 0, 1000);
  assert.equal(r.ok, false);
});
