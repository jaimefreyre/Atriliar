/**
 * Pitch-class primitives shared by validation and the harmony engine.
 * Single source of truth for note spelling <-> pitch class so it is never
 * duplicated (and never drifts) across modules.
 */

/** @type {Record<string, number>} */
const NOTE_TO_PITCH_CLASS = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

/** Positive modulo (JS `%` keeps the sign of the dividend). */
export function mod12(n) {
  return ((n % 12) + 12) % 12;
}

/** Default spelling for a bare pitch class (0-11) with no key context. */
export const PITCH_CLASS_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** @param {number} pitchClass 0-11 (mod12'd defensively) */
export function pitchClassToSharpName(pitchClass) {
  return PITCH_CLASS_NAMES_SHARP[mod12(pitchClass)];
}

/**
 * @param {string} note single-accidental spelling, e.g. "C#", "Bb"
 * @returns {number|null} pitch class 0-11, or null if not a recognized spelling
 */
export function noteToPitchClass(note) {
  if (typeof note !== 'string') return null;
  const pc = NOTE_TO_PITCH_CLASS[note];
  return pc === undefined ? null : pc;
}

/** Enharmonic equality: same pitch class regardless of spelling. */
export function sameNote(a, b) {
  const pa = noteToPitchClass(a);
  const pb = noteToPitchClass(b);
  return pa !== null && pb !== null && pa === pb;
}

const SLASH_BASS_RE = /\/([A-G](?:#|b)?)$/;

/**
 * Pulls the bass note out of a slash-chord symbol, e.g. "C/E" -> "E",
 * "Amaj7/9/E" -> "E" (only the trailing note counts as bass; an earlier
 * slash is an added-tone notation, not a second bass). Returns null when
 * the symbol has no trailing slash-note.
 * @param {string} symbol
 * @returns {string|null}
 */
export function extractSlashBass(symbol) {
  if (typeof symbol !== 'string') return null;
  const m = SLASH_BASS_RE.exec(symbol);
  return m ? m[1] : null;
}
