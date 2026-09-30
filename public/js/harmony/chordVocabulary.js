import { getChordTones } from '../music/harmony.js';

// Level 1 decodes 25 families with distinct pitch sets: no chord, 12 major
// and 12 minor triads. Colors (7, maj7, sus…) are chosen later inside each
// region, so near-duplicate templates never compete frame by frame.

export const N_FAMILY = 0;
export const FAMILY_COUNT = 25;
const mod12 = (value) => ((value % 12) + 12) % 12;

export const FAMILIES = Object.freeze([
  Object.freeze({ index: 0, id: 'N', root: null, mode: null, tones: Object.freeze([]) }),
  ...Array.from({ length: 12 }, (_, root) => Object.freeze({ index: 1 + root, id: `${root}:maj`, root, mode: 'maj', tones: Object.freeze([root, mod12(root + 4), mod12(root + 7)]) })),
  ...Array.from({ length: 12 }, (_, root) => Object.freeze({ index: 13 + root, id: `${root}:min`, root, mode: 'min', tones: Object.freeze([root, mod12(root + 3), mod12(root + 7)]) })),
]);

export const familyIndex = (root, mode) => (mode === 'maj' ? 1 : 13) + mod12(root);

// Relative intervals. `adds` must be present for the color to be accepted;
// `replaces` must be absent (a sus chord has no third, an aug no fifth).
export const VARIANTS_BY_MODE = Object.freeze({
  maj: Object.freeze([
    { quality: '', intervals: [0, 4, 7], adds: [], replaces: [] },
    { quality: '7', intervals: [0, 4, 7, 10], adds: [10], replaces: [] },
    { quality: 'maj7', intervals: [0, 4, 7, 11], adds: [11], replaces: [] },
    { quality: '6', intervals: [0, 4, 7, 9], adds: [9], replaces: [] },
    { quality: 'add9', intervals: [0, 2, 4, 7], adds: [2], replaces: [] },
    { quality: 'sus4', intervals: [0, 5, 7], adds: [5], replaces: [4] },
    { quality: 'sus2', intervals: [0, 2, 7], adds: [2], replaces: [4] },
    { quality: 'aug', intervals: [0, 4, 8], adds: [8], replaces: [7] },
    { quality: '5', intervals: [0, 7], adds: [], replaces: [4] },
  ]),
  min: Object.freeze([
    { quality: 'm', intervals: [0, 3, 7], adds: [], replaces: [] },
    { quality: 'm7', intervals: [0, 3, 7, 10], adds: [10], replaces: [] },
    { quality: 'm6', intervals: [0, 3, 7, 9], adds: [9], replaces: [] },
    { quality: 'dim', intervals: [0, 3, 6], adds: [6], replaces: [7] },
    { quality: 'm7b5', intervals: [0, 3, 6, 10], adds: [6, 10], replaces: [7] },
    { quality: 'dim7', intervals: [0, 3, 6, 9], adds: [6, 9], replaces: [7] },
    { quality: 'sus4', intervals: [0, 5, 7], adds: [5], replaces: [3] },
    { quality: 'sus2', intervals: [0, 2, 7], adds: [2], replaces: [3] },
    { quality: '5', intervals: [0, 7], adds: [], replaces: [3] },
  ]),
});

export const pitchSetKey = (tones) => [...new Set(tones.map(mod12))].sort((a, b) => a - b).join(',');

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Keys whose signature uses flats (majors and minors).
const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR_TONICS = new Set([2, 7, 0, 5, 10, 3]);

export function usesFlats(key) {
  if (!key || !Number.isInteger(key.tonic)) return false;
  return key.mode === 'min' ? FLAT_MINOR_TONICS.has(key.tonic) : FLAT_MAJOR_TONICS.has(key.tonic);
}

export function noteName(pitchClass, key = null) {
  return (usesFlats(key) ? FLAT_NAMES : SHARP_NAMES)[mod12(pitchClass)];
}

export function formatChordSymbol({ root, quality, bassPitchClass = null, key = null }) {
  if (!Number.isInteger(root)) return 'N';
  const base = `${noteName(root, key)}${quality}`;
  return Number.isInteger(bassPitchClass) && mod12(bassPitchClass) !== mod12(root) ? `${base}/${noteName(bassPitchClass, key)}` : base;
}

/** Level-1 family of any chord symbol (sus/5/aug count as major, dim family as minor). */
export function familyForSymbol(symbol) {
  if (!symbol || symbol === 'N') return N_FAMILY;
  const chord = getChordTones(symbol);
  if (!chord.recognized || !Number.isInteger(chord.rootPitchClass)) return null;
  const quality = chord.parsed.qualityId;
  const minor = /^m(?!aj)|dim|m7b5/.test(quality) || chord.tones.includes(mod12(chord.rootPitchClass + 3)) && !chord.tones.includes(mod12(chord.rootPitchClass + 4));
  return familyIndex(chord.rootPitchClass, minor ? 'min' : 'maj');
}

/** Every catalogued (root, quality) sharing the same pitch set, except the chord itself. */
export function sameNoteTwins(root, quality) {
  const variants = [...VARIANTS_BY_MODE.maj, ...VARIANTS_BY_MODE.min];
  const own = variants.find((variant) => variant.quality === quality);
  if (!own) return [];
  const key = pitchSetKey(own.intervals.map((interval) => root + interval));
  const twins = [];
  for (let otherRoot = 0; otherRoot < 12; otherRoot++) {
    for (const variant of variants) {
      if (otherRoot === mod12(root) && variant.quality === quality) continue;
      if (pitchSetKey(variant.intervals.map((interval) => otherRoot + interval)) === key
        && !twins.some((twin) => twin.root === otherRoot && twin.quality === variant.quality)) {
        twins.push({ root: otherRoot, quality: variant.quality });
      }
    }
  }
  return twins;
}
