// Chord annotations in the MIREX ".lab" format ("start end label", seconds)
// with Harte syntax labels (C:maj, A:min7, G:7/3, N, X), as used by public
// chord datasets. Converted to the app's symbols for harmonyMetrics.

const NOTE_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = { maj: '', min: 'm', 7: '7', maj7: 'maj7', min7: 'm7', dim: 'dim', aug: 'aug', sus4: 'sus4', sus2: 'sus2',
  hdim7: 'm7b5', dim7: 'dim7', maj6: '6', min6: 'm6', 9: '9', maj9: 'maj9', min9: 'm9', 5: '5', 1: '5', minmaj7: 'm(maj7)' };
const DEGREES = { 1: 0, b2: 1, 2: 2, '#2': 3, b3: 3, 3: 4, 4: 5, '#4': 6, b5: 6, 5: 7, '#5': 8, b6: 8, 6: 9, bb7: 9, b7: 10, 7: 11,
  b9: 1, 9: 2, '#9': 3, 11: 5, '#11': 6, b13: 8, 13: 9 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function rootPitchClass(root) {
  const match = /^([A-G])((?:b|#)*)$/.exec(root);
  if (!match) return null;
  let pc = NOTE_PCS[match[1]];
  for (const accidental of match[2]) pc += accidental === '#' ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}

/**
 * Harte label → app symbol ('N' for no chord, 'X' when it cannot be scored).
 * Unknown qualities or extensions in parentheses become 'X' (excluded), never a guess.
 */
export function harteToSymbol(label) {
  const text = String(label || '').trim();
  if (!text || text === 'N') return 'N';
  if (text === 'X') return 'X';
  const match = /^([A-G](?:b|#)*)(?::([^/()]*))?(\([^)]*\))?(?:\/(.+))?$/.exec(text);
  if (!match) return 'X';
  const [, root, rawQuality = 'maj', extensions, bassDegree] = match;
  const rootPc = rootPitchClass(root);
  const quality = QUALITY[rawQuality === '' ? 'maj' : rawQuality];
  if (rootPc === null || quality === undefined || (extensions && extensions !== '()')) return 'X';
  const flats = root.includes('b');
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  let symbol = `${names[rootPc]}${quality}`;
  if (bassDegree) {
    const interval = DEGREES[bassDegree];
    if (interval === undefined) return 'X';
    if (interval !== 0) symbol += `/${names[(rootPc + interval) % 12]}`;
  }
  return symbol;
}

/** Parse a .lab file into segments {startMs, endMs, symbol, label}; malformed lines are reported, not guessed. */
export function parseLabFile(text) {
  const segments = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/\s+/);
    const start = Number(parts[0]), end = Number(parts[1]);
    if (parts.length < 3 || !Number.isFinite(start) || !Number.isFinite(end) || end < start) { errors.push({ line: index + 1, text: trimmed }); return; }
    const label = parts.slice(2).join(' ');
    segments.push({ startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), symbol: harteToSymbol(label), label });
  });
  return { segments, errors };
}
