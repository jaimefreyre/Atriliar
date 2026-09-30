// Pitch-class and octave utilities. Chord recognition itself lives in
// public/js/harmony/ (the v6 harmony track); these only describe notes.

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const mod12 = (value) => ((value % 12) + 12) % 12;

/**
 * In-memory reference bank for MIDI pitches 24–108. Each note stores its
 * equal-tempered fundamental and a generic harmonic series; it is generated
 * from MIDI math so recognition does not depend on a physical MIDI device.
 */
export const MIDI_NOTE_FINGERPRINTS = Object.freeze(Array.from({ length: 85 }, (_, index) => {
  const midi = index + 24;
  const frequencyHz = 440 * 2 ** ((midi - 69) / 12);
  const partials = Array.from({ length: 10 }, (_, partialIndex) => {
    const harmonic = partialIndex + 1;
    return { harmonic, frequencyHz: frequencyHz * harmonic, strength: 1 / harmonic };
  });
  const chroma = Array(12).fill(0);
  partials.forEach(({ harmonic, strength }) => {
    const partialMidi = Math.round(midi + 12 * Math.log2(harmonic));
    chroma[mod12(partialMidi)] += strength;
  });
  const maximum = Math.max(...chroma, 1);
  return Object.freeze({ midi, frequencyHz, partials: Object.freeze(partials),
    chroma: Object.freeze(chroma.map((value) => value / maximum)) });
}));

/**
 * Expand pitch classes into every audible equal-tempered register.
 * Chord identity is octave-independent; these positions are visualization
 * references, not claims that a tone was measured at every octave.
 */
export function expandPitchClassesAcrossOctaves(pitchClasses, minHz = 32.7, maxHz = 5000) {
  if (!Array.isArray(pitchClasses) || pitchClasses.some((pitch) => !Number.isInteger(pitch))) {
    throw new TypeError('Los tonos del acorde deben ser una lista de clases de nota enteras.');
  }
  if (!(Number.isFinite(minHz) && Number.isFinite(maxHz) && minHz > 0 && maxHz > minHz)) {
    throw new RangeError('El rango de frecuencias debe ser positivo y creciente.');
  }
  const tones = new Set(pitchClasses.map(mod12));
  return Array.from({ length: 109 - 24 }, (_, index) => index + 24)
    .map((midi) => {
      const pitchClass = mod12(midi);
      const frequencyHz = 440 * 2 ** ((midi - 69) / 12);
      return { midi, pitchClass, octave: Math.floor(midi / 12) - 1, frequencyHz };
    })
    .filter((note) => tones.has(note.pitchClass) && note.frequencyHz >= minHz && note.frequencyHz <= maxHz)
    .map((note) => ({ ...note, label: `${ROOTS[note.pitchClass]}${note.octave}` }));
}

/** Build an octave-free chroma vector from note events, preserving relative energy. */
export function pitchClassProfileFromMidiNotes(notes) {
  if (!Array.isArray(notes)) throw new TypeError('Las notas deben ser una lista.');
  const profile = Array(12).fill(0);
  for (const note of notes) {
    if (!Number.isInteger(note?.midi) || !Number.isFinite(note?.strength ?? 1) || (note.strength ?? 1) < 0) {
      throw new TypeError('Cada nota debe tener midi entero y strength no negativo.');
    }
    profile[mod12(note.midi)] += note.strength ?? 1;
  }
  const maximum = Math.max(...profile);
  return maximum > 0 ? profile.map((value) => value / maximum) : profile;
}
