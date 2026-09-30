export function buildBackup({ legacySongs = [], songsV2 = [], projects = [], analyses = [], exportedAt = new Date().toISOString() } = {}) {
  if (![legacySongs, songsV2, projects, analyses].every(Array.isArray)) throw new TypeError('Las colecciones del respaldo deben ser arrays.');
  return {
    backupFormat: 'stageprompter-backup-v2',
    exportedAt,
    includesAudioFiles: false,
    notes: ['Los archivos de audio no están incluidos.', 'Los proyectos y análisis se incluyen como datos locales; los assets referenciados deben volver a vincularse.'],
    songsV2,
    legacySongs,
    projects,
    analyses,
  };
}

export function isBackupDocument(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.songsV2) || !Array.isArray(value.legacySongs)) return false;
  if (value.backupFormat === 'stageprompter-backup-v1') return true;
  return value.backupFormat === 'stageprompter-backup-v2' && Array.isArray(value.projects) && Array.isArray(value.analyses);
}
