import { getChordTones } from './harmony.js';

/**
 * Compares one normalized/live chroma frame with the expected chord tones.
 * This reports pitch-class compatibility, not string-level fingering or note
 * transcription; callers must gate the result on their own signal quality.
 * @param {number[]} chroma Twelve non-negative energies in C..B order.
 * @param {string} chordSymbol Chord understood by the shared harmony parser.
 * @param {{minEnergy?:number,minInChordRatio?:number}} [options]
 */
export function scoreChordChroma(chroma, chordSymbol, { minEnergy = 1e-6, minInChordRatio = 0.65 } = {}) {
  if (!Array.isArray(chroma) || chroma.length !== 12 || chroma.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError('El croma debe contener 12 energías finitas y no negativas en orden C..B.');
  }
  if (!Number.isFinite(minEnergy) || minEnergy < 0 || !Number.isFinite(minInChordRatio) || minInChordRatio < 0 || minInChordRatio > 1) {
    throw new RangeError('Los umbrales de croma están fuera de rango.');
  }
  const chord = getChordTones(chordSymbol);
  if (!chord.recognized) {
    return { status: 'unknown-chord', withinChord: null, ratio: null, energy: chroma.reduce((sum, value) => sum + value, 0), chordPitchClasses: [] };
  }
  const pitchClasses = [...new Set([...chord.tones, ...(chord.bassPitchClass === null ? [] : [chord.bassPitchClass])])];
  const energy = chroma.reduce((sum, value) => sum + value, 0);
  if (energy < minEnergy) {
    return { status: 'low-signal', withinChord: null, ratio: null, energy, chordPitchClasses: pitchClasses };
  }
  const inChordEnergy = pitchClasses.reduce((sum, pitchClass) => sum + chroma[pitchClass], 0);
  const ratio = inChordEnergy / energy;
  return {
    status: 'scored',
    withinChord: ratio >= minInChordRatio,
    ratio,
    energy,
    chordPitchClasses: pitchClasses.sort((a, b) => a - b),
  };
}
