import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importSongV2Document } from '../../public/js/data/importSongV2.js';

test('un asset distinto de audio.assetId se rechaza antes de abrir almacenamiento', async () => {
  const song = JSON.parse(readFileSync(new URL('../../docs/spec-v2/contratos/demo-original.song.json', import.meta.url), 'utf8'));
  song.audio = { assetId: 'asset-expected', offsetMs: 0 };
  const result = await importSongV2Document(song, async () => 'cancel', { id: 'asset-other', blob: new Blob() });
  assert.equal(result.status, 'invalid');
  assert.equal(result.errors[0].instancePath, '/audio/assetId');
});
