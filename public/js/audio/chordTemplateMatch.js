import { getChordTones } from '../music/harmony.js';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'm7b5', '6', 'm6', 'sus2', 'sus4', '7sus4', 'dim', 'dim7', 'aug', '5'];
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

function makeChordTemplate(symbol) {
  const chord = getChordTones(symbol);
  const quality = chord.parsed.qualityId;
  const thirdInterval = ['m', 'm6', 'm7', 'm7b5', 'dim', 'dim7'].includes(quality) ? 3
    : quality === 'sus2' ? 2 : ['sus4', '7sus4'].includes(quality) ? 5 : 4;
  const fifthInterval = ['dim', 'dim7', 'm7b5'].includes(quality) ? 6 : quality === 'aug' ? 8 : 7;
  const seventhInterval = ['7', 'm7', 'm7b5', '7sus4', '9', '11', '13'].includes(quality) ? 10
    : quality === 'maj7' ? 11 : quality === 'dim7' ? 9 : null;
  const definingPitchClasses = quality === '5'
    ? [chord.rootPitchClass, mod12(chord.rootPitchClass + 7)]
    : [chord.rootPitchClass, mod12(chord.rootPitchClass + thirdInterval)];
  return Object.freeze({ symbol, rootPitchClass: chord.rootPitchClass, tones: Object.freeze(chord.tones),
    quality, definingPitchClasses: Object.freeze(definingPitchClasses),
    fifthPitchClass: mod12(chord.rootPitchClass + fifthInterval),
    seventhPitchClass: seventhInterval === null ? null : mod12(chord.rootPitchClass + seventhInterval) });
}

/** Chord fingerprints are also cached once in memory instead of rebuilt per audio frame. */
export const CHORD_FINGERPRINTS = Object.freeze(ROOTS.flatMap((root) =>
  QUALITIES.map((quality) => makeChordTemplate(`${root}${quality}`))));

/**
 * Compare live chroma with precomputed MIDI-derived note and chord templates.
 * @param {number[]} chroma non-negative pitch-class energy in C,C#,D,... order
 * @param {{minScore?:number,minMargin?:number,bassPitchClass?:number|null,fundamentalPitchClass?:number|null}} [options]
 */
export function matchChordTemplate(chroma, {
  minScore = 0.4, minMargin = 0.035, minToneStrength = 0.1,
  bassPitchClass = null, fundamentalPitchClass = null,
} = {}) {
  if (!Array.isArray(chroma) && !ArrayBuffer.isView(chroma)) throw new TypeError('Croma debe ser un vector de 12 valores.');
  if (chroma.length !== 12 || [...chroma].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Croma debe contener exactamente 12 valores finitos no negativos.');
  }
  const maximum = Math.max(...chroma);
  if (maximum === 0) return { symbol: null, score: 0, margin: 0, accepted: false };
  const normalized = [...chroma].map((value) => value / maximum);
  const totalEnergy = normalized.reduce((sum, value) => sum + value, 0);
  const ranked = CHORD_FINGERPRINTS.map((template) => {
    const toneEnergy = template.tones.reduce((sum, tone) => sum + normalized[tone], 0);
    const coverage = toneEnergy / Math.max(totalEnergy, 1e-9);
    const averageToneStrength = toneEnergy / template.tones.length;
    const rootStrength = normalized[template.rootPitchClass];
    const thirdStrength = normalized[template.definingPitchClasses[1]];
    const fifthStrength = normalized[template.fifthPitchClass];
    const seventhStrength = template.seventhPitchClass === null ? 0 : normalized[template.seventhPitchClass];
    const definingStrength = template.quality === '5'
      ? (rootStrength + fifthStrength) / 2
      : .42 * rootStrength + .43 * thirdStrength + .15 * fifthStrength;
    let score = .55 * coverage + .3 * averageToneStrength + .15 * definingStrength;
    if (template.seventhPitchClass !== null) {
      // Prefer a seventh template when its distinguishing tone is actually
      // present; otherwise a triad should win instead of hallucinating 7ths.
      score += seventhStrength >= minToneStrength ? .035 : -.04;
    }
    if (Number.isInteger(bassPitchClass)) {
      // Give the bass/root a decisive but soft preference. Shared pitch sets
      // such as Am7/C6 otherwise have identical chroma fingerprints.
      score += mod12(bassPitchClass) === template.rootPitchClass ? .12
        : template.tones.includes(mod12(bassPitchClass)) ? -.01 : -.08;
    }
    if (Number.isInteger(fundamentalPitchClass)) {
      score += template.tones.includes(mod12(fundamentalPitchClass)) ? .02 : -.015;
    }
    const supportedTones = template.tones.filter((tone) => normalized[tone] >= minToneStrength).length;
    const definingEvidence = template.definingPitchClasses.every((tone) => normalized[tone] >= minToneStrength);
    return { symbol: template.symbol, score, coverage,
      supportedTones, definingEvidence, tones: template.tones };
  }).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const best = ranked[0];
  const margin = best.score - (ranked[1]?.score || 0);
  const accepted = best.score >= minScore && margin >= minMargin
    && best.supportedTones >= 2 && best.definingEvidence;
  return { symbol: best.symbol, score: Math.max(0, Math.min(1, best.score)), margin, accepted,
    alternatives: ranked.slice(0, 6).map(({ symbol, score, tones, coverage, supportedTones, definingEvidence }) => ({
      symbol, score: Math.max(0, Math.min(1, score)), tones: [...tones],
      coverage: Number(coverage.toFixed(4)), supportedTones, definingEvidence,
    })),
    supportedTones: best.supportedTones, coverage: best.coverage };
}
