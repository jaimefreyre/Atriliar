import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAnalysisChords, syncAnalysisToSong } from '../../public/js/data/chartSync.js';
import { buildLabSong, initialLabSections } from '../../public/js/audio/labComposition.js';
import { validateSongV2 } from '../../public/js/data/songValidator.js';

function songWithLyrics() {
  const sections = initialLabSections(1000);
  sections[0].lyric = 'Primera palabra segunda palabra';
  return buildLabSong({ title: 'Prueba', artist: '', durationMs: 1000, bpm: 120,
    chordSuggestions: [], uncertainChordCount: 0, sections });
}

const analysis = { durationMs: 1000, harmony: { regions: [
  { id: 'h-0', startMs: 0, endMs: 500, state: 'harmony', symbol: 'C/E' },
  { id: 'h-500', startMs: 500, endMs: 1000, state: 'harmony', symbol: 'Am' },
  { id: 'h-silence', startMs: 250, endMs: 400, state: 'no-chord', symbol: null },
] } };

test('proyecta solo regiones armónicas, bajo slash, IDs estables y anclas de texto', () => {
  const song = songWithLyrics();
  song.id = 'song-test';
  const first = projectAnalysisChords(song, analysis);
  assert.deepEqual(first.chords.map(({ id, symbol, bassNote }) => [id, symbol, bassNote]), [
    ['ch-0', 'C/E', 'E'], ['ch-500', 'Am', null],
  ]);
  assert.equal(first.chords[0].anchor.lineId, 'line-lab-section-1');
  assert.equal(first.chords[0].anchor.charOffset, 0);
  assert.equal(first.provenance.every((entry) => entry.status === 'estimated'), true);
  assert.deepEqual(validateSongV2({ ...song, chords: first.chords, reviewWarnings: first.warnings }).errors, []);
});

test('actualizar reemplaza solo IDs generados y no duplica, conserva y respeta acordes manuales', () => {
  const song = songWithLyrics();
  song.id = 'song-test';
  song.chords = [{ id: 'human-1', startMs: 200, endMs: 300, symbol: 'Dm', bassNote: null, anchor: null, scale: null }];
  const first = syncAnalysisToSong(song, analysis);
  const second = syncAnalysisToSong(first.song, analysis, { previousGeneratedIds: first.generatedChordIds });
  assert.equal(second.song.chords.filter((chord) => chord.id === 'human-1').length, 1);
  assert.equal(second.song.chords.filter((chord) => chord.id.startsWith('ch-')).length, 3);
  assert.equal(new Set(second.song.chords.map((chord) => chord.id)).size, second.song.chords.length);
  assert.deepEqual(validateSongV2(second.song).errors, []);
});
