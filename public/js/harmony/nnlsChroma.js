// NNLS chroma: approximate note transcription followed by pitch-class
// folding, after Mauch & Dixon (2010), the method behind Chordino. Written
// from the published method, not as a line-by-line port. The vendored
// Essentia's NNLSChroma returns zeros with useNNLS=true and its LogSpectrum
// re-instantiates per call, so the front end lives here in plain JS.
//
// Pipeline per frame: magnitude spectrum → log-frequency spectrum (3 bins per
// semitone) → global tuning correction → spectral whitening → non-negative
// least squares against 84 harmonic note templates → treble and bass chroma.

export const BINS_PER_SEMITONE = 3;
export const LOG_BINS = 256;
export const NOTE_COUNT = 84; // MIDI 21 (A0) .. 104 (G#7)
export const FIRST_MIDI = 21;
const BIN0_MIDI = FIRST_MIDI - 1 / BINS_PER_SEMITONE; // bin 3n+1 is exactly MIDI 21+n

const binMidi = (bin) => BIN0_MIDI + bin / BINS_PER_SEMITONE;
const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
// Raised cosine over ±1 log bin (±1/3 semitone).
const cosPulse = (distanceInBins) => (Math.abs(distanceInBins) >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * distanceInBins));

/**
 * Sparse linear-bin → log-bin kernel. The linear spectrum is sampled on a grid
 * `oversampling` times finer than its bins (linear interpolation), so low log
 * bins, narrower than one FFT bin, still receive energy. Weights are not
 * normalized per log bin: a narrow partial keeps its amplitude at any height.
 */
export function createLogFreqKernel({ sampleRate, frameSize, oversampling = 16 }) {
  const binHz = sampleRate / frameSize;
  const maxLinearBin = frameSize / 2;
  const lowHz = midiToHz(binMidi(-1));
  const highHz = Math.min(midiToHz(binMidi(LOG_BINS)), (maxLinearBin - 1) * binHz);
  const entries = new Map();
  const add = (logBin, linearBin, weight) => {
    if (weight <= 0 || linearBin < 0 || linearBin > maxLinearBin) return;
    const key = logBin * (maxLinearBin + 1) + linearBin;
    entries.set(key, (entries.get(key) || 0) + weight);
  };
  const step = 1 / oversampling;
  for (let q = lowHz / binHz; q <= highHz / binHz; q += step) {
    const pitchBins = (hzToMidi(q * binHz) - BIN0_MIDI) * BINS_PER_SEMITONE;
    const nearest = Math.round(pitchBins);
    const base = Math.floor(q);
    const frac = q - base;
    for (let logBin = nearest - 1; logBin <= nearest + 1; logBin++) {
      if (logBin < 0 || logBin >= LOG_BINS) continue;
      const weight = cosPulse(pitchBins - logBin) * step;
      add(logBin, base, weight * (1 - frac));
      add(logBin, base + 1, weight * frac);
    }
  }
  const sorted = [...entries.entries()].sort((a, b) => a[0] - b[0]);
  const logIndex = new Uint16Array(sorted.length);
  const linearIndex = new Uint32Array(sorted.length);
  const weights = new Float32Array(sorted.length);
  sorted.forEach(([key, weight], index) => {
    logIndex[index] = Math.floor(key / (maxLinearBin + 1));
    linearIndex[index] = key % (maxLinearBin + 1);
    weights[index] = weight;
  });
  return { sampleRate, frameSize, logIndex, linearIndex, weights, size: sorted.length };
}

export function logFreqSpectrum(magnitudes, kernel, out = new Float32Array(LOG_BINS)) {
  out.fill(0);
  const { logIndex, linearIndex, weights, size } = kernel;
  for (let index = 0; index < size; index++) out[logIndex[index]] += weights[index] * magnitudes[linearIndex[index]];
  return out;
}

/** Energy per third-of-a-semitone position, accumulated for tuning estimation. */
export function accumulateTuning(logSpectrum, sums = new Float64Array(3)) {
  const upper = Math.round(LOG_BINS * 0.62 / BINS_PER_SEMITONE) * BINS_PER_SEMITONE;
  for (let bin = 0; bin < upper; bin++) sums[bin % BINS_PER_SEMITONE] += logSpectrum[bin];
  return sums;
}

/**
 * Circular mean of the three sub-semitone positions. Bin 3n+1 is the nominal
 * semitone, so a perfectly tuned recording gives 0.
 * @returns {{bins:number, cents:number, referenceHz:number}}
 */
export function estimateTuning(sums) {
  let x = 0, y = 0;
  for (let j = 0; j < BINS_PER_SEMITONE; j++) {
    const angle = (2 * Math.PI * j) / BINS_PER_SEMITONE;
    x += sums[j] * Math.cos(angle);
    y += sums[j] * Math.sin(angle);
  }
  if (x === 0 && y === 0) return { bins: 0, cents: 0, referenceHz: 440 };
  let bins = (Math.atan2(y, x) * BINS_PER_SEMITONE) / (2 * Math.PI) - 1;
  if (bins < -1.5) bins += BINS_PER_SEMITONE;
  if (bins >= 1.5) bins -= BINS_PER_SEMITONE;
  const cents = (bins / BINS_PER_SEMITONE) * 100;
  return { bins, cents, referenceHz: 440 * 2 ** (cents / 1200) };
}

function hammingWindow(length) {
  const window = Float64Array.from({ length }, (_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (length - 1)));
  const total = window.reduce((sum, value) => sum + value, 0);
  return window.map((value) => value / total);
}
const WHITENING_WINDOW = hammingWindow(19);

/** Shift by the tuning offset, then remove the local spectral envelope. */
export function tuneAndWhiten(logSpectrum, tuningBins, { whitening = 1 } = {}, out = new Float32Array(LOG_BINS)) {
  const tuned = new Float64Array(LOG_BINS);
  for (let bin = 0; bin < LOG_BINS; bin++) {
    const source = bin + tuningBins;
    const base = Math.floor(source);
    const frac = source - base;
    const a = base >= 0 && base < LOG_BINS ? logSpectrum[base] : 0;
    const b = base + 1 >= 0 && base + 1 < LOG_BINS ? logSpectrum[base + 1] : 0;
    tuned[bin] = a + (b - a) * frac;
  }
  const half = (WHITENING_WINDOW.length - 1) / 2;
  const mean = new Float64Array(LOG_BINS);
  for (let bin = 0; bin < LOG_BINS; bin++) {
    let total = 0, weight = 0;
    for (let k = -half; k <= half; k++) {
      const index = bin + k;
      if (index < 0 || index >= LOG_BINS) continue;
      total += WHITENING_WINDOW[k + half] * tuned[index];
      weight += WHITENING_WINDOW[k + half];
    }
    mean[bin] = total / weight;
  }
  for (let bin = 0; bin < LOG_BINS; bin++) {
    let total = 0, weight = 0;
    for (let k = -half; k <= half; k++) {
      const index = bin + k;
      if (index < 0 || index >= LOG_BINS) continue;
      const deviation = tuned[index] - mean[index];
      total += WHITENING_WINDOW[k + half] * deviation * deviation;
      weight += WHITENING_WINDOW[k + half];
    }
    const std = Math.sqrt(total / weight);
    const residual = tuned[bin] - mean[bin];
    out[bin] = residual > 0 && std > 0 ? residual / std ** whitening : 0;
  }
  return out;
}

/** 84 harmonic note templates on the log axis (columns L2-normalized) and their Gram matrix. */
export function createNoteDictionary({ spectralShape = 0.7, harmonics = 20 } = {}) {
  const columns = Array.from({ length: NOTE_COUNT }, (_, note) => {
    const column = new Float64Array(LOG_BINS);
    for (let h = 1; h <= harmonics; h++) {
      const pitchBins = (FIRST_MIDI + note + 12 * Math.log2(h) - BIN0_MIDI) * BINS_PER_SEMITONE;
      if (pitchBins > LOG_BINS) break;
      const amplitude = spectralShape ** (h - 1);
      for (let bin = Math.floor(pitchBins) - 1; bin <= Math.ceil(pitchBins) + 1; bin++) {
        if (bin >= 0 && bin < LOG_BINS) column[bin] += amplitude * cosPulse(bin - pitchBins);
      }
    }
    const norm = Math.hypot(...column) || 1;
    return column.map((value) => value / norm);
  });
  const gram = new Float64Array(NOTE_COUNT * NOTE_COUNT);
  for (let a = 0; a < NOTE_COUNT; a++) {
    for (let b = a; b < NOTE_COUNT; b++) {
      let dot = 0;
      for (let bin = 0; bin < LOG_BINS; bin++) dot += columns[a][bin] * columns[b][bin];
      gram[a * NOTE_COUNT + b] = dot;
      gram[b * NOTE_COUNT + a] = dot;
    }
  }
  return { columns, gram };
}

/**
 * Non-negative least squares by coordinate descent on the Gram matrix.
 * Only notes with energy around their fundamental take part, as in Chordino.
 * @param {Float64Array|null} warmStart previous frame's solution
 */
export function solveNNLS(dictionary, spectrum, { warmStart = null, maxSweeps = 40, tolerance = 1e-4 } = {}) {
  const { columns, gram } = dictionary;
  const x = new Float64Array(NOTE_COUNT);
  const active = [];
  for (let note = 0; note < NOTE_COUNT; note++) {
    const bin = BINS_PER_SEMITONE * note;
    if (spectrum[bin] + spectrum[bin + 1] + spectrum[bin + 2] > 0) active.push(note);
  }
  if (!active.length) return x;
  const b = new Float64Array(NOTE_COUNT);
  for (const note of active) {
    let dot = 0;
    const column = columns[note];
    for (let bin = 0; bin < LOG_BINS; bin++) dot += column[bin] * spectrum[bin];
    b[note] = dot;
    x[note] = warmStart ? Math.max(0, warmStart[note]) : 0;
  }
  // residual r = b - G x (restricted to the active set)
  const r = new Float64Array(NOTE_COUNT);
  for (const i of active) {
    let gx = 0;
    for (const j of active) gx += gram[i * NOTE_COUNT + j] * x[j];
    r[i] = b[i] - gx;
  }
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxChange = 0, maxValue = 0;
    for (const j of active) {
      const diagonal = gram[j * NOTE_COUNT + j];
      if (diagonal <= 0) continue;
      const updated = Math.max(0, x[j] + r[j] / diagonal);
      const delta = updated - x[j];
      if (delta !== 0) {
        for (const i of active) r[i] -= delta * gram[i * NOTE_COUNT + j];
        x[j] = updated;
        maxChange = Math.max(maxChange, Math.abs(delta));
      }
      maxValue = Math.max(maxValue, x[j]);
    }
    if (maxChange <= tolerance * Math.max(maxValue, 1e-12)) break;
  }
  return x;
}

/** Sum of the three sub-bins per semitone: the no-NNLS mapping (Essentia's useNNLS=false). */
export function linearSemitones(spectrum) {
  const out = new Float64Array(NOTE_COUNT);
  for (let note = 0; note < NOTE_COUNT; note++) {
    const bin = BINS_PER_SEMITONE * note;
    out[note] = spectrum[bin] + spectrum[bin + 1] + spectrum[bin + 2];
  }
  return out;
}

// Register profiles: treble for harmony (A2..C6 flat, tapering), bass A0..A3.
const ramp = (value, from, to) => Math.min(1, Math.max(0, (value - from) / (to - from)));
export const TREBLE_PROFILE = Float64Array.from({ length: NOTE_COUNT }, (_, note) => {
  const midi = FIRST_MIDI + note;
  return ramp(midi, 33, 45) * (1 - ramp(midi, 84, 96));
});
export const BASS_PROFILE = Float64Array.from({ length: NOTE_COUNT }, (_, note) => {
  const midi = FIRST_MIDI + note;
  return ramp(midi, 21, 28) * (1 - ramp(midi, 52, 60));
});

/** Fold semitone activations into C-based treble and bass chroma. */
export function semitonesToChroma(semitones, treble = new Float32Array(12), bass = new Float32Array(12)) {
  treble.fill(0);
  bass.fill(0);
  for (let note = 0; note < NOTE_COUNT; note++) {
    const value = semitones[note];
    if (!(value > 0)) continue;
    const pitchClass = (FIRST_MIDI + note) % 12;
    treble[pitchClass] += value * TREBLE_PROFILE[note];
    bass[pitchClass] += value * BASS_PROFILE[note];
  }
  return { treble, bass };
}
