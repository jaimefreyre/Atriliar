import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandPitchClassesAcrossOctaves, matchChordTemplate, pitchClassProfileFromMidiNotes } from '../../public/js/audio/chordTemplateMatch.js';

test('un croma C-E-G favorece C mayor y expone score/margen', () => {
  const result = matchChordTemplate([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(result.symbol, 'C');
  assert.equal(result.accepted, true);
  assert.ok(result.score > 0.9);
  assert.ok(result.margin > 0.04);
  assert.equal(result.alternatives[0].symbol, 'C');
  assert.equal(result.alternatives.length, 6);
});

test('un vector vacío no inventa armonía', () => {
  assert.deepEqual(matchChordTemplate(Array(12).fill(0)), { symbol: null, score: 0, margin: 0, accepted: false });
});

test('valida la forma y valores de croma antes de comparar', () => {
  assert.throws(() => matchChordTemplate([1, 2]), RangeError);
  assert.throws(() => matchChordTemplate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1]), RangeError);
});

test('reconoce acordes menores y calidades de séptima a partir de sus notas', () => {
  const profile = (...pitchClasses) => {
    const chroma = Array(12).fill(0.015);
    pitchClasses.forEach((pitch, index) => { chroma[pitch] = 1 - index * 0.08; });
    return chroma;
  };
  for (const [symbol, notes] of Object.entries({
    Cm: [0, 3, 7], Cm7: [0, 3, 7, 10], C7: [0, 4, 7, 10], Cmaj7: [0, 4, 7, 11],
  })) {
    const result = matchChordTemplate(profile(...notes), { bassPitchClass: notes[0], minScore: 0.38, minMargin: 0.02 });
    assert.equal(result.symbol, symbol, `${symbol} should rank first`);
    assert.equal(result.accepted, true, `${symbol} should pass validation`);
  }
});

test('usa la nota de bajo para separar acordes con el mismo conjunto de notas', () => {
  const am7Notes = [9, 0, 4, 7];
  const chroma = Array(12).fill(0.015);
  am7Notes.forEach((pitch) => { chroma[pitch] = 1; });
  assert.equal(matchChordTemplate(chroma, { bassPitchClass: 9 }).symbol, 'Am7');
  assert.equal(matchChordTemplate(chroma, { bassPitchClass: 0 }).symbol, 'C6');
});

test('la huella del acorde ignora la octava de cada nota', () => {
  const profiles = [
    pitchClassProfileFromMidiNotes([{ midi: 60 }, { midi: 64 }, { midi: 67 }]), // C4 E4 G4
    pitchClassProfileFromMidiNotes([{ midi: 84 }, { midi: 76 }, { midi: 55 }]), // C6 E5 G3
  ];
  const results = profiles.map((chroma) => matchChordTemplate(chroma, { bassPitchClass: 0 }));
  assert.deepEqual(profiles[0], profiles[1]);
  assert.deepEqual(results.map(({ symbol, accepted }) => [symbol, accepted]), [['C', true], ['C', true]]);
});

test('reconoce Do menor cuando sus notas están repartidas entre octavas', () => {
  const chroma = pitchClassProfileFromMidiNotes([{ midi: 48 }, { midi: 63 }, { midi: 79 }]); // C3 D#4 G5
  const result = matchChordTemplate(chroma, { bassPitchClass: 0 });
  assert.equal(result.symbol, 'Cm');
  assert.equal(result.accepted, true);
});

test('expande la referencia visual de cada tono por todos los registros del espectro', () => {
  const markers = expandPitchClassesAcrossOctaves([0, 4, 7], 32.7, 5000);
  for (const pitchClass of [0, 4, 7]) {
    const notes = markers.filter((marker) => marker.pitchClass === pitchClass);
    assert.ok(notes.length >= 5, `se esperaban varios registros para pitch class ${pitchClass}`);
    assert.ok(notes.every((note) => note.frequencyHz >= 32.7 && note.frequencyHz <= 5000));
  }
  assert.ok(markers.some((marker) => marker.label === 'C1'));
  assert.ok(markers.some((marker) => marker.label === 'C3'));
  assert.ok(markers.some((marker) => marker.label === 'C6'));
});
