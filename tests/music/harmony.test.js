import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordSymbol, getChordTones } from '../../public/js/music/harmony.js';
import { getScaleNotes } from '../../public/js/music/scales.js';
import { noteToPitchClass, sameNote, mod12 } from '../../public/js/music/notes.js';

function tonesOf(symbol, bassOverride) {
  return getChordTones(symbol, bassOverride).tones.slice().sort((a, b) => a - b);
}
function pcSet(...notes) {
  return notes.map(noteToPitchClass).sort((a, b) => a - b);
}

// Tabla de aceptación de ESPECIFICACION.md §6.

test('C#m7(b5): C#, E, G, B; no incluye G# (la 5a justa)', () => {
  const { tones, rootPitchClass, recognized } = getChordTones('C#m7(b5)');
  assert.equal(recognized, true);
  assert.equal(rootPitchClass, noteToPitchClass('C#'));
  assert.deepEqual(tones.sort((a, b) => a - b), pcSet('C#', 'E', 'G', 'B'));
  assert.ok(!tones.includes(noteToPitchClass('G#')));
});

test('Cm7b5 (sin paréntesis) da el mismo resultado que Cm7(b5)', () => {
  assert.deepEqual(tonesOf('Cm7b5'), tonesOf('Cm7(b5)'));
});

test('G7(b5): G, B, F, Db/C# (enarmonía permitida)', () => {
  const tones = tonesOf('G7(b5)');
  assert.deepEqual(tones, pcSet('G', 'B', 'Db', 'F'));
});

test('C7sus4: C, F, G, Bb; no incluye E (ni mayor ni menor)', () => {
  const tones = tonesOf('C7sus4');
  assert.deepEqual(tones, pcSet('C', 'F', 'G', 'Bb'));
  assert.ok(!tones.includes(noteToPitchClass('E')));
});

test('Am/C: raíz A, bajo C (separado), notas A/C/E', () => {
  const r = getChordTones('Am', 'C');
  assert.equal(r.root, 'A');
  assert.equal(r.bass, 'C');
  assert.equal(r.bassPitchClass, noteToPitchClass('C'));
  assert.deepEqual(r.tones.sort((a, b) => a - b), pcSet('A', 'C', 'E'));
});

test('C/D: bajo D independiente de la tríada C/E/G (D no pertenece al acorde)', () => {
  const r = getChordTones('C', 'D');
  assert.equal(r.bass, 'D');
  assert.deepEqual(r.tones.sort((a, b) => a - b), pcSet('C', 'E', 'G'));
  assert.ok(!r.tones.includes(r.bassPitchClass));
});

test('Cfoo: texto preservado, no reconocido, ninguna tríada inventada', () => {
  const parsed = parseChordSymbol('Cfoo');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.recognized, false);
  assert.equal(parsed.original, 'Cfoo');
  assert.equal(parsed.root, 'C');
  const tones = getChordTones('Cfoo');
  assert.equal(tones.recognized, false);
  assert.deepEqual(tones.tones, []);
});

test('Bb con escala mayor (ionian): pitch classes 10,0,2,3,5,7,9', () => {
  const notes = getScaleNotes('Bb', 'ionian');
  const pcs = notes.map(noteToPitchClass).sort((a, b) => a - b);
  assert.deepEqual(pcs, [0, 2, 3, 5, 7, 9, 10]);
});

test('raíz con bemol (Bb7) da las mismas notas que su enarmónico (A#7)', () => {
  assert.deepEqual(tonesOf('Bb7'), tonesOf('A#7'));
});

test('sus sin número no cae a tríada mayor (se trata como sus4)', () => {
  const tones = tonesOf('Dsus');
  assert.deepEqual(tones, tonesOf('Dsus4'));
  assert.ok(!tones.includes(noteToPitchClass('F#'))); // 3a mayor de D, no debería aparecer
});

test('acordes con extensión suelta root/ext/bajo: Amaj7/9/E', () => {
  const parsed = parseChordSymbol('Amaj7/9/E');
  assert.equal(parsed.recognized, true);
  assert.equal(parsed.bass, 'E');
  assert.ok(parsed.extensions.includes('9'));
});

for (const root of ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']) {
  test(`catálogo mínimo de calidades resuelve para raíz ${root} (12 raíces x calidades)`, () => {
    const qualities = ['', 'm', '5', '6', 'm6', '7', 'maj7', 'm7', 'm7b5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', '7sus4', 'add9', 'add11', '9', '11', '13'];
    for (const q of qualities) {
      const { recognized, tones } = getChordTones(root + q);
      assert.equal(recognized, true, `${root}${q}`);
      assert.ok(tones.length > 0, `${root}${q}`);
    }
  });
}

test('0, 12 y 22 trastes: mod12 de MIDI abierto+traste siempre cae en 0-11', () => {
  const TUNING = [40, 45, 50, 55, 59, 64];
  for (const openMidi of TUNING) {
    for (const fret of [0, 12, 22]) {
      const pc = mod12(openMidi + fret);
      assert.ok(pc >= 0 && pc <= 11);
    }
  }
});

test('sameNote compara por pitch class, no por texto', () => {
  assert.equal(sameNote('D#', 'Eb'), true);
  assert.equal(sameNote('C', 'B#'), true);
  assert.equal(sameNote('C', 'D'), false);
});
