import test from 'node:test';
import assert from 'node:assert/strict';
import { initialLabSections, splitLabSection, sectionAt, buildLabSong } from '../../public/js/audio/labComposition.js';
import { validateSongV2 } from '../../public/js/data/songValidator.js';

test('dividir una pieza conserva una partición completa y navegable', () => {
  const sections = initialLabSections(10000);
  assert.equal(splitLabSection(sections, 4000), true);
  assert.deepEqual(sections.map((section) => [section.startMs, section.endMs]), [[0, 4000], [4000, 10000]]);
  assert.equal(sectionAt(sections, 4000), sections[1]);
  assert.equal(splitLabSection(sections, 10000), false);
});

test('la letra y la tab escritas se convierten en eventos de canción válidos', () => {
  const sections = initialLabSections(10000);
  splitLabSection(sections, 4000);
  sections[1].type = 'chorus'; sections[1].label = 'Estribillo';
  sections[1].lyric = 'Vuelve la voz'; sections[1].tab = 'e|--0--2--|';
  const song = buildLabSong({ title: 'Prueba', artist: '', durationMs: 10000, bpm: 120,
    chordSuggestions: [{ symbol: 'C', startMs: 4000, endMs: 5000 }], uncertainChordCount: 0,
    audioAssetId: 'asset-test', sections });
  assert.equal(song.lines[0].sectionId, sections[1].id);
  assert.equal(song.tabs[0].ascii, 'e|--0--2--|');
  assert.equal(song.chords[0].symbol, 'C');
  assert.deepEqual(validateSongV2(song).errors, []);
});
