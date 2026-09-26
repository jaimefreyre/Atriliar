import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, isBackupDocument } from '../public/js/data/backup.js';

test('respaldo declara que el audio queda fuera y conserva documentos V1/V2', () => {
  const legacy = [{ id: 'old' }];
  const v2 = [{ id: 'new', audio: { assetId: 'asset-1', offsetMs: 0 } }];
  const backup = buildBackup({ legacySongs: legacy, songsV2: v2, exportedAt: '2026-09-26T00:00:00.000Z' });
  assert.equal(backup.includesAudioFiles, false);
  assert.deepEqual(backup.legacySongs, legacy);
  assert.deepEqual(backup.songsV2, v2);
  assert.equal(isBackupDocument(backup), true);
  assert.equal(isBackupDocument({ backupFormat: 'stageprompter-backup-v1', songsV2: [], legacySongs: 'bad' }), false);
});
