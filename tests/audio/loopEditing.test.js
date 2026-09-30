import test from 'node:test';
import assert from 'node:assert/strict';
import { audioBufferToWav, resizeAudioClip } from '../../public/js/audio/loopEditing.js';

test('trimming a clip from the left advances its source position and preserves the right edge', () => {
  const clip = { startMs: 500, sourceStartMs: 1000, durationMs: 2000, captureRate: 2 };
  assert.deepEqual(resizeAudioClip(clip, 'left', 250), {
    ...clip, startMs: 750, sourceStartMs: 1500, durationMs: 1750,
  });
});

test('left trim clamps at the clip source start and keeps a short clip', () => {
  const clip = { startMs: 200, sourceStartMs: 50, durationMs: 120 };
  assert.deepEqual(resizeAudioClip(clip, 'left', -500), {
    ...clip, startMs: 150, sourceStartMs: 0, durationMs: 170,
  });
  assert.equal(resizeAudioClip(clip, 'left', 500).durationMs, 100);
});

test('right trim respects the source boundary and minimum clip duration', () => {
  const clip = { startMs: 0, sourceStartMs: 200, durationMs: 300, captureRate: 2 };
  assert.equal(resizeAudioClip(clip, 'right', 500, { sourceDurationMs: 900 }).durationMs, 350);
  assert.equal(resizeAudioClip(clip, 'right', -500).durationMs, 100);
});

test('WAV export writes a stereo 16-bit PCM RIFF payload', async () => {
  const buffer = { numberOfChannels: 2, length: 2, sampleRate: 8000,
    getChannelData: (channel) => channel === 0 ? new Float32Array([-1, .5]) : new Float32Array([1, -.5]) };
  const wav = audioBufferToWav(buffer);
  assert.equal(wav.type, 'audio/wav');
  const bytes = new DataView(await wav.arrayBuffer());
  assert.equal(String.fromCharCode(...new Uint8Array(bytes.buffer, 0, 4)), 'RIFF');
  assert.equal(bytes.getUint16(22, true), 2);
  assert.equal(bytes.getUint32(24, true), 8000);
  assert.equal(bytes.getUint16(34, true), 16);
  assert.equal(bytes.getInt16(44, true), -32768);
  assert.equal(bytes.getInt16(46, true), 32767);
});
