import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioDraft } from '../../public/js/audio/draftBuilder.js';
import { validateSongV2 } from '../../public/js/data/songValidator.js';

test('construye un borrador v2 válido como estimado y con advertencias explícitas', () => {
  const doc = buildAudioDraft({ title: '  Tema instrumental ', durationMs: 8000, bpm: 120,
    chordSuggestions: [{ symbol: 'C', startMs: 0, endMs: 4000 }, { symbol: 'G', startMs: 4000, endMs: 8000 }] });
  assert.equal(doc.metadata.title, 'Tema instrumental');
  assert.equal(doc.timing.status, 'estimated');
  assert.equal(doc.timing.method, 'auto-analyzed');
  assert.equal(doc.sections.at(-1).endMs, doc.durationMs);
  assert.equal(validateSongV2(doc).valid, true);
});

test('los acordes automáticos entran marcados como estimados y los slash llevan su bajo', () => {
  const doc = buildAudioDraft({ title: 'Bajada', durationMs: 8000, bpm: 90, chordSuggestions: [
    { symbol: 'Am', startMs: 0, endMs: 2000, confirmed: true }, { symbol: 'Am/G', startMs: 2000, endMs: 4000 },
    { symbol: 'Am/F#', startMs: 4000, endMs: 6000 }, { symbol: 'Fmaj7', startMs: 6000, endMs: 8000 }] });
  assert.deepEqual(doc.chords.map((chord) => [chord.symbol, chord.bassNote]), [['Am', null], ['Am/G', 'G'], ['Am/F#', 'F#'], ['Fmaj7', null]]);
  assert.ok(doc.reviewWarnings.some((warning) => warning.startsWith('3 de 4 acordes son estimados')));
  assert.equal(validateSongV2(doc).valid, true);
});

test('sin candidatos deja acordes vacíos y advierte que no se inventaron', () => {
  const doc = buildAudioDraft({ title: 'Solo ruido', durationMs: 2000, bpm: 95 });
  assert.deepEqual(doc.chords, []);
  assert.ok(doc.reviewWarnings.some((warning) => warning.includes('no se inventaron')));
  assert.equal(validateSongV2(doc).valid, true);
});
