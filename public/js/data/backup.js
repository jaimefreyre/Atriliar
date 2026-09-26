export function buildBackup({ legacySongs = [], songsV2 = [], exportedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(legacySongs) || !Array.isArray(songsV2)) throw new TypeError('Las canciones del respaldo deben ser arrays.');
  return {
    backupFormat: 'stageprompter-backup-v1',
    exportedAt,
    includesAudioFiles: false,
    notes: ['Los archivos de audio no están incluidos.', 'Las canciones que referencian audio conservan su assetId y requieren volver a vincular el archivo.'],
    songsV2,
    legacySongs,
  };
}

export function isBackupDocument(value) {
  return value && typeof value === 'object' && value.backupFormat === 'stageprompter-backup-v1'
    && Array.isArray(value.songsV2) && Array.isArray(value.legacySongs);
}
