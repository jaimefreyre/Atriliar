import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureProjectForSong, importProjectBackupData, saveWorkspaceFromLab, updateCipher } from '../../public/js/data/projectRepo.js';
import { projectBundleFromLab } from '../../public/js/data/projectModel.js';

function createMemoryStore() {
  const songs = new Map(), projects = new Map(), analyses = new Map(), assets = new Map();
  const key = (record) => `${record.songId}|${record.source}|${record.engineVersion}`;
  return {
    songs, projects, analyses, assets,
    async getSongV2(id) { return songs.get(id); },
    async getProject(id) { return projects.get(id); },
    async getProjectById(id) { return [...projects.values()].find((project) => project.projectId === id); },
    async getAllProjects() { return [...projects.values()]; },
    async getAllAnalyses() { return [...analyses.values()]; },
    async getAnalysesForSong(id) { return [...analyses.values()].filter((analysis) => analysis.songId === id); },
    async getAnalysis(songId, source, engineVersion) { return analyses.get(`${songId}|${source}|${engineVersion}`); },
    async getAsset(id) { return assets.get(id); },
    async saveProject(project) { projects.set(project.songId, project); },
    async saveAnalysis(analysis) { analyses.set(key(analysis), analysis); },
    async deleteAnalysis(songId, source, engineVersion) { analyses.delete(`${songId}|${source}|${engineVersion}`); },
    async deleteProject(songId) { projects.delete(songId); },
    async saveProjectBundle({ song, project, analysis, asset }) {
      songs.set(song.id, song); projects.set(project.songId, project);
      if (analysis) analyses.set(key(analysis), analysis);
      if (asset) assets.set(asset.id, asset);
    },
    async saveSongProjectAnalysis({ song, project }) { songs.set(song.id, song); projects.set(project.songId, project); },
  };
}

function lab() {
  return { id: 'lab-repo-1', title: 'Prueba', artist: '', bpm: 100, audioAssetId: null,
    sections: [{ id: 'section', type: 'verse', label: 'Verso', startMs: 0, endMs: 2000, lyric: 'Una frase', tab: '' }],
    stems: [], loop: {}, analysis: { durationMs: 2000, bpm: 100, harmony: { version: 6, engine: 'nnls-hmm-1', regions: [
      { id: 'h-0', startMs: 0, endMs: 1000, state: 'harmony', symbol: 'C' },
      { id: 'h-1000', startMs: 1000, endMs: 2000, state: 'harmony', symbol: 'Am' },
    ] } } };
}

test('guardar dos veces conserva una canción/proyecto y reemplaza los acordes automáticos', async () => {
  const store = createMemoryStore();
  const source = lab();
  const first = await saveWorkspaceFromLab(source, { now: '2026-09-30T00:00:00.000Z', store });
  assert.equal(first.status, 'created');
  assert.equal(store.songs.size, 1);
  assert.equal(store.projects.size, 1);
  assert.equal(store.analyses.size, 1);
  source.analysis.harmony.regions = [{ id: 'h-0', startMs: 0, endMs: 2000, state: 'harmony', symbol: 'Dm' }];
  const second = await saveWorkspaceFromLab(source, { now: '2026-09-30T00:00:01.000Z', store });
  assert.equal(second.status, 'updated');
  assert.equal(second.songId, first.songId);
  assert.deepEqual([...store.songs.values()][0].chords.map(({ id, symbol }) => [id, symbol]), [['ch-0', 'Dm']]);
  assert.equal(store.songs.size, 1);
  assert.equal(store.projects.size, 1);
  assert.equal(store.analyses.size, 1);
});

test('guardar ediciones de letra y tab actualiza la canción enlazada', async () => {
  const store = createMemoryStore();
  const source = lab();
  const first = await saveWorkspaceFromLab(source, { store });
  source.sections[0].lyric = 'Otra frase';
  source.sections[0].tab = 'E|--3--|';
  const second = await saveWorkspaceFromLab(source, { store });
  assert.equal(second.status, 'updated');
  assert.equal(second.song.lines[0].text, 'Otra frase');
  assert.equal(second.song.tabs[0].ascii, 'E|--3--|');
  assert.equal(second.project.sections[0].lyric, 'Otra frase');
  assert.equal(store.songs.size, 1);
  assert.equal(store.projects.size, 1);
});

test('crear un proyecto al abrir conserva el cifrado como restricciones y no lo vuelve a crear', async () => {
  const store = createMemoryStore();
  const song = projectBundleFromLab(lab()).song;
  const first = await ensureProjectForSong(song, { now: '2026-09-30T00:00:00.000Z', store });
  const second = await ensureProjectForSong(song, { now: '2026-09-30T00:00:01.000Z', store });
  assert.equal(first, second);
  assert.equal(store.projects.size, 1);
  assert.equal(first.confirmedChords.length, song.chords.length);
});

test('actualizar cifrado conserva eventos manuales y mantiene IDs automáticos únicos', async () => {
  const store = createMemoryStore();
  const source = lab();
  const bundle = projectBundleFromLab(source);
  bundle.song.chords = [{ id: 'manual-1', startMs: 500, endMs: 750, symbol: 'G', bassNote: null, anchor: null, scale: null }];
  store.songs.set(bundle.song.id, bundle.song);
  store.projects.set(bundle.project.songId, bundle.project);
  const result = await updateCipher(bundle.song.id, source.analysis, { store });
  assert.equal(result.status, 'updated');
  assert.equal(result.song.chords.filter((chord) => chord.id === 'manual-1').length, 1);
  assert.equal(new Set(result.song.chords.map((chord) => chord.id)).size, result.song.chords.length);
});

test('importar respaldo remapea solo documentos que sí se importaron', async () => {
  const store = createMemoryStore();
  store.songs.set('copy-song', projectBundleFromLab(lab()).song);
  const result = await importProjectBackupData({ store, songIdMap: new Map([['old-song', 'copy-song']]),
    projects: [{ songId: 'old-song', projectId: 'project-old' }, { songId: 'cancelled-song', projectId: 'skip' }],
    analyses: [{ songId: 'old-song', source: 'src', engineVersion: 'v6' }, { songId: 'cancelled-song', source: 'src', engineVersion: 'v6' }] });
  assert.deepEqual(result, { importedProjects: 1, importedAnalyses: 1 });
  assert.equal(store.projects.has('copy-song'), true);
  assert.equal([...store.analyses.values()][0].songId, 'copy-song');
});
