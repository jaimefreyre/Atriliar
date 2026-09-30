import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, isBackupDocument } from '../public/js/data/backup.js';

test('respaldo v2 incluye proyectos y análisis, y deja el audio fuera', () => {
  const legacy = [{ id: 'old' }];
  const v2 = [{ id: 'new', audio: { assetId: 'asset-1', offsetMs: 0 } }];
  const projects = [{ songId: 'new', projectId: 'project-new' }];
  const analyses = [{ songId: 'new', source: 'lab-one', engineVersion: 'v6' }];
  const backup = buildBackup({ legacySongs: legacy, songsV2: v2, projects, analyses, exportedAt: '2026-09-26T00:00:00.000Z' });
  assert.equal(backup.backupFormat, 'stageprompter-backup-v2');
  assert.equal(backup.includesAudioFiles, false);
  assert.deepEqual(backup.legacySongs, legacy);
  assert.deepEqual(backup.songsV2, v2);
  assert.deepEqual(backup.projects, projects);
  assert.deepEqual(backup.analyses, analyses);
  assert.equal(isBackupDocument(backup), true);
  assert.equal(isBackupDocument({ backupFormat: 'stageprompter-backup-v1', songsV2: [], legacySongs: 'bad' }), false);
  assert.equal(isBackupDocument({ backupFormat: 'stageprompter-backup-v1', songsV2: [], legacySongs: [] }), true);
});
