import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandPitchClassesAcrossOctaves, pitchClassProfileFromMidiNotes, MIDI_NOTE_FINGERPRINTS } from '../../public/js/audio/chordTemplateMatch.js';

test('el perfil de clases de nota ignora la octava de cada nota', () => {
  const low = pitchClassProfileFromMidiNotes([{ midi: 60 }, { midi: 64 }, { midi: 67 }]); // C4 E4 G4
  const spread = pitchClassProfileFromMidiNotes([{ midi: 84 }, { midi: 76 }, { midi: 55 }]); // C6 E5 G3
  assert.deepEqual(low, spread);
  assert.deepEqual(low.map((value, pc) => (value ? pc : null)).filter((pc) => pc !== null), [0, 4, 7]);
  assert.throws(() => pitchClassProfileFromMidiNotes([{ midi: 60.5 }]), TypeError);
});

test('la huella MIDI de cada nota nace de su serie armónica', () => {
  const a4 = MIDI_NOTE_FINGERPRINTS.find((note) => note.midi === 69);
  assert.equal(a4.frequencyHz, 440);
  assert.equal(a4.chroma[9], 1);
  assert.ok(a4.chroma[4] > 0, 'la quinta aparece como armónico');
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
