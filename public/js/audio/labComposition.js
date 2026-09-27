import { buildAudioDraft } from './draftBuilder.js';

export function initialLabSections(durationMs) {
  return [{ id: 'lab-section-1', type: 'instrumental', label: 'Pieza completa', startMs: 0,
    endMs: durationMs, lyric: '', tab: '' }];
}

export function sectionAt(sections, positionMs) {
  return sections.find((section) => positionMs >= section.startMs && positionMs < section.endMs)
    || (positionMs === sections.at(-1)?.endMs ? sections.at(-1) : null);
}

export function splitLabSection(sections, positionMs) {
  const section = sectionAt(sections, positionMs);
  if (!section || !Number.isSafeInteger(positionMs) || positionMs - section.startMs < 500 || section.endMs - positionMs < 500) return false;
  const oldEnd = section.endMs;
  section.endMs = positionMs;
  const index = sections.indexOf(section);
  sections.splice(index + 1, 0, { id: `lab-section-${Date.now()}-${index + 1}`, type: 'instrumental',
    label: `Sección ${sections.length + 1}`, startMs: positionMs, endMs: oldEnd, lyric: '', tab: '' });
  return true;
}

/** Transfer user-authored arrangement, lyrics and ASCII tab without treating analyzer guesses as verified notes. */
export function buildLabSong({ title, artist, durationMs, bpm, chordSuggestions, uncertainChordCount,
  audioAssetId, sections }) {
  const song = buildAudioDraft({ title, artist, durationMs, bpm, chordSuggestions, uncertainChordCount, audioAssetId });
  song.sections = sections.map(({ id, type, label, startMs, endMs }) => ({ id, type,
    label: label.trim() || 'Sección sin nombre', key: null, startMs, endMs }));
  song.lines = sections.flatMap((section) => section.lyric?.trim() ? [{ id: `line-${section.id}`, sectionId: section.id,
    startMs: section.startMs, endMs: section.endMs, text: section.lyric.trim(), tokens: [] }] : []);
  song.tabs = sections.flatMap((section) => section.tab?.trim() ? [{ id: `tab-${section.id}`, sectionId: section.id,
    startMs: section.startMs, endMs: section.endMs, label: section.label.trim() || 'Tablatura', ascii: section.tab.trim() }] : []);
  if (song.lines.length || song.tabs.length) song.reviewWarnings.push('La letra y la tablatura fueron escritas por el usuario; revisar sus tiempos en el editor.');
  return song;
}
