const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };
function normalizeNote(note) { if (!note) return null; return FLAT_TO_SHARP[note.toUpperCase()] || note.toUpperCase(); }
function parseChord(chordStr) {
  const normalized = chordStr.trim().replace(/\s+/g, '');
  const regex = /^([A-G][#b]?)(maj7|7M|M7|m7|7|m|dim|aug|sus4|add9|)(?:\(([^)]+)\))?(?:\/([A-G][#b]?))?$/i;
  const match = normalized.match(regex);
  if (!match) return { valid: false };
  let [, root, quality, tensions, bass] = match;
  root = normalizeNote(root);
  if (quality === 'M7' || quality === 'maj7') quality = '7M';
  const extensions = [], alterations = [];
  if (tensions) { tensions.split(',').forEach(t => { t = t.trim(); if (t.includes('b') || t.includes('#')) alterations.push(t); else extensions.push(t); }); }
  return { valid: true, root, quality, extensions, alterations, bass: normalizeNote(bass) };
}
function transposeChord(chordStr, semitones) {
  const p = parseChord(chordStr);
  if (!p.valid) return chordStr;
  const newRoot = NOTES[(NOTES.indexOf(p.root) + semitones + 12) % 12];
  let newBass = p.bass ? NOTES[(NOTES.indexOf(p.bass) + semitones + 12) % 12] : null;
  let res = newRoot + p.quality;
  if (p.extensions.length || p.alterations.length) res += `(${[...p.extensions, ...p.alterations].join(',')})`;
  if (newBass) res += `/${newBass}`;
  return res;
}
const testCases = [
  { input: 'F#', semitones: 2, expected: 'G#' },
  { input: 'F#7M', semitones: 2, expected: 'G#7M' },
  { input: 'F#7M(9,#5)', semitones: 2, expected: 'G#7M(9,#5)' },
  { input: 'F#7M(9,#5)/A#', semitones: 2, expected: 'G#7M(9,#5)/C' },
  { input: 'C#m7(b5)', semitones: -1, expected: 'Cm7(b5)' },
  { input: 'D/F#', semitones: 2, expected: 'E/G#' },
  { input: 'Bb7M(9)', semitones: 1, expected: 'B7M(9)' }
];
console.log('🎵 Ejecutando Tests del Motor de Acordes...\n');
let passed = 0;
testCases.forEach(({ input, semitones, expected }) => {
  const result = transposeChord(input, semitones);
  if (result === expected) { console.log(`✅ PASS: ${input} +${semitones} = ${result}`); passed++; }
  else { console.log(`❌ FAIL: ${input} +${semitones} | Esperado: ${expected}, Obtenido: ${result}`); }
});
console.log(`\nResultado: ${passed}/${testCases.length} tests pasados.`);
process.exit(passed === testCases.length ? 0 : 1);