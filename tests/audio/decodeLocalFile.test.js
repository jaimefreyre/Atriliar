import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLocalFile } from '../../public/js/audio/decodeLocalFile.js';

test('decodifica localmente y mezcla dos canales a mono', async () => {
  const channels = [new Float32Array([1, 0.5, 0, -0.5]), new Float32Array([0, 0.5, 1, 0.5])];
  class FakeAudioContext {
    async decodeAudioData() { return { length: 4, duration: 0.04, numberOfChannels: 2, sampleRate: 100,
      getChannelData: (index) => channels[index] }; }
    async close() { this.closed = true; }
  }
  const result = await decodeLocalFile({ arrayBuffer: async () => new ArrayBuffer(0) }, { AudioContextClass: FakeAudioContext });
  assert.equal(result.durationMs, 40);
  assert.equal(result.sampleRate, 100);
  assert.deepEqual([...result.pcm], [0.5, 0.5, 0.5, 0]);
});

test('rechaza argumentos que no son archivos', async () => {
  await assert.rejects(() => decodeLocalFile(null, { AudioContextClass: class {} }), TypeError);
});
