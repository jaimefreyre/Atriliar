/**
 * Single chord-symbol parser and harmony calculator (ESPECIFICACION.md §6).
 * The only module that turns a chord symbol string into pitch classes —
 * chordDiagram.js (SVG), transpose.js and any future prompter/tab code all
 * read from here instead of keeping their own copy of the interval tables.
 *
 * Root/bass keep their ORIGINAL spelling (Bb stays "Bb", never forced to
 * "A#") since the contract requires preserving musical spelling for display
 * while comparing enharmonics by pitch class. Computed chord tones are
 * pitch classes (0-11), not note names: naming them is a rendering choice,
 * not a harmony fact.
 */

import { mod12, noteToPitchClass, pitchClassToSharpName } from './notes.js';

const NOTE_PATTERN = '[A-G](?:#|b)?';

// Alternation order: longer/more specific tokens before short ones that
// share a prefix (backtracking would still find the right one either way,
// this just avoids relying on that). Case is handled by the /i flag at
// match time; canonicalQuality() below inspects the actual captured text
// (which preserves input case) to tell "M7" (major) from "m7" (minor).
const QUALITY_TOKENS = [
  'maj7', '7M', 'm7b5', 'm7', 'm6', '7sus4', 'sus4', 'sus2', 'sus',
  'add9', 'add11', 'dim7', 'dim', 'aug', '13', '11', '9', '7', '6', '5', 'm', '',
];

const CHORD_RE = new RegExp(
  `^(${NOTE_PATTERN})(${QUALITY_TOKENS.join('|')})` +
  `(?:\\(([^)]+)\\))?(?:\\/([0-9]+[b#]?))?(?:\\/(${NOTE_PATTERN}))?$`,
  'i'
);
const ROOT_ONLY_RE = new RegExp(`^(${NOTE_PATTERN})(.*)$`, 'i');

/** Canonical quality id -> intervals in semitones above the root. */
const QUALITY_INTERVALS = {
  '': [0, 4, 7],
  'm': [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  'm7b5': [0, 3, 6, 10], // medio disminuido: 3ª menor, 5ª disminuida, 7ª menor (no 5ª justa)
  'dim': [0, 3, 6],
  'dim7': [0, 3, 6, 9],
  'aug': [0, 4, 8],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  'add9': [0, 4, 7, 14],
  'add11': [0, 4, 7, 17],
  '9': [0, 4, 7, 10, 14],
  '11': [0, 4, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21],
};

// Una alteración con signo REEMPLAZA el grado base en conflicto (nunca lo
// suma): m7(b5) debe perder la 5ª justa, no conservarla junto a la b5.
const ALTERATION_TARGETS = {
  'b5': { replaces: 7, value: 6 },
  '#5': { replaces: 7, value: 8 },
  'b9': { replaces: 14, value: 13 },
  '#9': { replaces: 14, value: 15 },
  'b11': { replaces: 17, value: 16 },
  '#11': { replaces: 17, value: 18 },
  'b13': { replaces: 21, value: 20 },
  '#13': { replaces: 21, value: 22 },
};

const EXTENSION_INTERVALS = { '9': 14, '11': 17, '13': 21 };

/** @returns {string|null} canonical id into QUALITY_INTERVALS, or null if unrecognized */
function canonicalQuality(raw) {
  // "M7"/"m7" is the one pair where case is meaningful and the regex (/i)
  // can't tell them apart by itself; every other token is case-folded.
  if (raw === 'M7' || raw === '7M') return 'maj7';
  if (raw === 'm7') return 'm7';
  const lower = raw.toLowerCase();
  if (lower === 'sus') return 'sus4';
  return Object.prototype.hasOwnProperty.call(QUALITY_INTERVALS, lower) ? lower : null;
}

/** First letter uppercased, accidental preserved as written (never flips b<->#). */
function normalizeSpelling(raw) {
  if (!raw) return null;
  const letter = raw[0].toUpperCase();
  const accidental = raw[1];
  return accidental ? letter + accidental : letter;
}

/**
 * @param {string} symbol e.g. "Am", "C#m7(b5)", "Amaj7/9/E", "Cfoo"
 * @returns {{valid:boolean, recognized:boolean, original:string, root:string|null,
 *   qualityRaw:string, qualityId:string|null, extensions:string[], alterations:string[], bass:string|null}}
 */
export function parseChordSymbol(symbol) {
  if (typeof symbol !== 'string' || symbol.length === 0) {
    return { valid: false, recognized: false, original: symbol, root: null, qualityRaw: '', qualityId: null, extensions: [], alterations: [], bass: null };
  }
  const normalized = symbol.trim().replace(/\s+/g, '');
  const match = CHORD_RE.exec(normalized);

  if (!match) {
    const fallback = ROOT_ONLY_RE.exec(normalized);
    if (!fallback) {
      return { valid: false, recognized: false, original: symbol, root: null, qualityRaw: '', qualityId: null, extensions: [], alterations: [], bass: null };
    }
    return {
      valid: true, recognized: false, original: symbol,
      root: normalizeSpelling(fallback[1]), qualityRaw: fallback[2] || '',
      qualityId: null, extensions: [], alterations: [], bass: null,
    };
  }

  const [, rootRaw, qualityRaw, tensions, looseExt, bassRaw] = match;
  const extensions = [];
  const alterations = [];
  const classify = (token) => {
    const t = token.trim().toLowerCase();
    if (!t) return;
    if (t.includes('b') || t.includes('#')) alterations.push(t); else extensions.push(t);
  };
  if (tensions) tensions.split(',').forEach(classify);
  if (looseExt) classify(looseExt);

  return {
    valid: true,
    recognized: canonicalQuality(qualityRaw) !== null,
    original: symbol,
    root: normalizeSpelling(rootRaw),
    qualityRaw,
    qualityId: canonicalQuality(qualityRaw),
    extensions,
    alterations,
    bass: bassRaw ? normalizeSpelling(bassRaw) : null,
  };
}

function computeIntervals(qualityId, extensions, alterations) {
  let intervals = [...QUALITY_INTERVALS[qualityId]];
  extensions.forEach((ext) => {
    const value = EXTENSION_INTERVALS[ext];
    if (value !== undefined && !intervals.includes(value)) intervals.push(value);
  });
  alterations.forEach((alt) => {
    const target = ALTERATION_TARGETS[alt];
    if (!target) return; // alteración no reconocida: se ignora, no se inventa un semitono
    intervals = intervals.filter((i) => i !== target.replaces);
    if (!intervals.includes(target.value)) intervals.push(target.value);
  });
  return intervals;
}

/**
 * @param {string} symbol
 * @param {string|null} [bassOverride] usar `chords[].bassNote` del documento
 *   v2 en vez de re-derivar el bajo del texto del símbolo, cuando ambos
 *   existen como campos separados (ver CONTRATO-DATOS.md).
 * @returns {{recognized:boolean, root:string|null, rootPitchClass:number|null,
 *   bass:string|null, bassPitchClass:number|null, tones:number[], parsed:object}}
 *   `tones` son pitch classes 0-11 del acorde (sin el bajo); vacío si no se
 *   reconoce la calidad, para no dibujar una tríada inventada.
 */
export function getChordTones(symbol, bassOverride) {
  const parsed = parseChordSymbol(symbol);
  const bass = bassOverride !== undefined ? bassOverride : parsed.bass;
  const bassPitchClass = bass ? noteToPitchClass(bass) : null;

  if (!parsed.valid || parsed.root === null) {
    return { recognized: false, root: null, rootPitchClass: null, bass, bassPitchClass, tones: [], parsed };
  }
  const rootPitchClass = noteToPitchClass(parsed.root);
  if (rootPitchClass === null || !parsed.recognized) {
    return { recognized: false, root: parsed.root, rootPitchClass, bass, bassPitchClass, tones: [], parsed };
  }

  const intervals = computeIntervals(parsed.qualityId, parsed.extensions, parsed.alterations);
  const tones = Array.from(new Set(intervals.map((i) => mod12(rootPitchClass + i)))).sort((a, b) => a - b);
  return { recognized: true, root: parsed.root, rootPitchClass, bass, bassPitchClass, tones, parsed };
}

/** "maj7"/"M7"/"7M" all display as "7M" (established convention); everything else keeps its as-typed form. */
export function displayQuality(parsed) {
  return parsed.qualityId === 'maj7' ? '7M' : parsed.qualityRaw;
}

/**
 * Rebuilds a chord symbol with its root (and bass, if any) transposed by
 * `semitones`. Unrecognized/unparseable symbols are returned unchanged
 * rather than guessing. Transposed note names always use sharp spelling
 * (an accepted enharmonic per ESPECIFICACION.md §6's acceptance table).
 */
export function transposeChordSymbol(symbol, semitones) {
  const parsed = parseChordSymbol(symbol);
  if (!parsed.valid || parsed.root === null) return symbol;
  const rootPc = noteToPitchClass(parsed.root);
  if (rootPc === null) return symbol;

  const newRoot = pitchClassToSharpName(rootPc + semitones);
  let result = newRoot + displayQuality(parsed);
  if (parsed.extensions.length > 0 || parsed.alterations.length > 0) {
    result += `(${[...parsed.extensions, ...parsed.alterations].join(',')})`;
  }
  if (parsed.bass) {
    const bassPc = noteToPitchClass(parsed.bass);
    if (bassPc !== null) result += `/${pitchClassToSharpName(bassPc + semitones)}`;
  }
  return result;
}

/**
 * Transposes a bare key/tonic (e.g. "C", "F#m", "Bb"). Minor keys keep
 * their "m" suffix — the historical bug transposed only major-spelled
 * keys and silently returned minor keys unchanged.
 */
export function transposeKey(keyStr, semitones) {
  if (typeof keyStr !== 'string') return keyStr;
  const m = /^([A-G](?:#|b)?)(m?)$/.exec(keyStr.trim());
  if (!m) return keyStr;
  const pc = noteToPitchClass(m[1]);
  if (pc === null) return keyStr;
  return pitchClassToSharpName(pc + semitones) + m[2];
}
