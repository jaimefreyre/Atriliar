import { parseChord, normalizeNote } from './chordParser.js';
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function transposeChord(chordStr, semitones) {
  const parsed = parseChord(chordStr);
  if (!parsed || !parsed.valid) return chordStr;
  const newRoot = NOTES[(NOTES.indexOf(parsed.root) + semitones + 12) % 12];
  let newBass = parsed.bass ? NOTES[(NOTES.indexOf(parsed.bass) + semitones + 12) % 12] : null;
  let result = newRoot + parsed.quality;
  if (parsed.extensions.length > 0 || parsed.alterations.length > 0) result += `(${[...parsed.extensions, ...parsed.alterations].join(',')})`;
  if (newBass) result += `/${newBass}`;
  return result;
}
export function transposeKey(keyStr, semitones) {
  const normalized = normalizeNote(keyStr);
  const idx = NOTES.indexOf(normalized);
  return idx === -1 ? keyStr : NOTES[(idx + semitones + 12) % 12];
}