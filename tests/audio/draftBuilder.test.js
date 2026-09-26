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

test('sin candidatos deja acordes vacíos y advierte que no se inventaron', () => {
  const doc = buildAudioDraft({ title: 'Solo ruido', durationMs: 2000, bpm: 95 });
  assert.deepEqual(doc.chords, []);
  assert.ok(doc.reviewWarnings.some((warning) => warning.includes('no se inventaron')));
  assert.equal(validateSongV2(doc).valid, true);
});
