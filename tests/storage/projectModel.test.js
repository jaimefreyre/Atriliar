import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisFromLab, labSectionsFromSong, projectBundleFromLab, projectFromSong, stableSongIdForLab } from '../../public/js/data/projectModel.js';
import { validateSongV2 } from '../../public/js/data/songValidator.js';

function lab() {
  return { id: 'lab-test-01', title: 'Ensayo', artist: 'Música', bpm: 120, audioAssetId: 'asset-test',
    sections: [{ id: 'lab-section-1', type: 'verse', label: 'Verso', startMs: 0, endMs: 1000, lyric: 'Una línea', tab: 'E|--0--|' }],
    stems: [], loop: { tracks: [] }, analysis: { durationMs: 1000, bpm: 120, harmony: { version: 6, engine: 'nnls-hmm-1',
      regions: [{ id: 'h-0', startMs: 0, endMs: 1000, state: 'harmony', symbol: 'Am' }] } } };
}

test('crea un SongDocument válido y un proyecto/analysis normalizados separados', () => {
  const current = lab();
  const bundle = projectBundleFromLab(current, { now: '2026-09-30T00:00:00.000Z' });
  assert.equal(bundle.song.id, 'audio-draft-lab-test-01');
  assert.equal(bundle.song.lines[0].text, 'Una línea');
  assert.equal(bundle.song.tabs[0].ascii, 'E|--0--|');
  assert.equal(bundle.song.chords[0].id, 'ch-0');
  assert.equal(bundle.project.analysis, undefined);
  assert.equal(bundle.project.songId, bundle.song.id);
  assert.equal(bundle.analysis.analysis.harmony.version, 6);
  assert.deepEqual(validateSongV2(bundle.song).errors, []);
  assert.equal(stableSongIdForLab(current), bundle.song.id);
});

test('al abrir una canción sin proyecto crea restricciones confirmadas desde el cifrado existente', () => {
  const song = projectBundleFromLab(lab()).song;
  const project = projectFromSong(song, { now: '2026-09-30T00:00:00.000Z' });
  assert.deepEqual(project.confirmedChords, [{ startMs: 0, endMs: 1000, symbol: 'Am' }]);
});

test('una pieza sin línea conserva secciones y no atribuye letra inventada', () => {
  const current = lab(); current.sections[0].lyric = '   '; current.sections[0].tab = '';
  const bundle = projectBundleFromLab(current);
  assert.deepEqual(bundle.song.lines, []);
  assert.deepEqual(bundle.song.tabs, []);
  assert.deepEqual(validateSongV2(bundle.song).errors, []);
});

test('rehidrata la letra y la tablatura del SongDocument usando los IDs del laboratorio', () => {
  const bundle = projectBundleFromLab(lab());
  const sections = labSectionsFromSong(bundle.song, bundle.project.sectionIdMap);
  assert.deepEqual(sections.map(({ id, lyric, tab }) => [id, lyric, tab]), [['lab-section-1', 'Una línea', 'E|--0--|']]);
});

test('no se crea SongDocument si no hay una duración conocida', () => {
  const current = lab(); current.analysis.durationMs = 0; current.sections = [];
  assert.equal(projectBundleFromLab(current), null);
});

test('analysis key identifica el motor y el origen del workspace actual', () => {
  const record = analysisFromLab(lab(), 'song-a', { now: '2026-09-30T00:00:00.000Z' });
  assert.deepEqual([record.songId, record.source, record.engineVersion], ['song-a', 'lab:lab-test-01', 'nnls-hmm-1-v6']);
});
