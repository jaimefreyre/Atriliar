const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TARGET_RATE = 44100;
const WINDOW_SIZE = 4096;
let essentia = null;
let ring = new Float32Array(WINDOW_SIZE);
let writeIndex = 0;
let filled = 0;
let samplesSinceAnalysis = 0;

async function loadEssentia() {
  const [core, wasmGlue] = await Promise.all([
    import('../../vendor/essentia/essentia.js-core.es.js'),
    import('../../vendor/essentia/essentia-wasm.es.js'),
  ]);
  essentia = new core.default(wasmGlue.EssentiaWASM);
}

function resample(input, sourceRate) {
  if (sourceRate === TARGET_RATE) return input;
  const output = new Float32Array(Math.max(1, Math.round(input.length * TARGET_RATE / sourceRate)));
  const ratio = sourceRate / TARGET_RATE;
  for (let index = 0; index < output.length; index++) {
    const at = index * ratio;
    const left = Math.floor(at);
    const mix = at - left;
    const a = input[Math.min(left, input.length - 1)] || 0;
    const b = input[Math.min(left + 1, input.length - 1)] || 0;
    output[index] = a + (b - a) * mix;
  }
  return output;
}

function midiLabel(frequencyHz) {
  const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  return { midi, note: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}` };
}

function analyzeWindow(timestampMs) {
  const frame = new Float32Array(WINDOW_SIZE);
  for (let index = 0; index < WINDOW_SIZE; index++) frame[index] = ring[(writeIndex + index) % WINDOW_SIZE];
  const vector = essentia.arrayToVector(frame);
  let windowed, spectrum, peaks, hpcp;
  try {
    windowed = essentia.Windowing(vector, true, WINDOW_SIZE, 'hann', 0, true);
    spectrum = essentia.Spectrum(windowed.frame, WINDOW_SIZE);
    peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.00002, 5000, 120, 40, 'frequency', TARGET_RATE);
    let pitchHz = 0, pitchConfidence = 0;
    try {
      const pitch = essentia.PitchYinFFT(spectrum.spectrum, WINDOW_SIZE, true, 1600, 45, TARGET_RATE, 1);
      pitchHz = Number(pitch.pitch) || 0;
      pitchConfidence = Number(pitch.pitchConfidence) || 0;
    } catch { /* The spectrum and chroma remain useful when the tuner has no monophonic pitch. */ }
    hpcp = essentia.HPCP(peaks.frequencies, peaks.magnitudes);
    const source = Array.from(essentia.vectorToArray(hpcp.hpcp), Number);
    const chroma = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map((index) => source[index] || 0);
    const frequencies = Array.from(essentia.vectorToArray(peaks.frequencies), Number);
    const magnitudes = Array.from(essentia.vectorToArray(peaks.magnitudes), Number);
    const byMidi = new Map();
    frequencies.forEach((frequencyHz, index) => {
      if (!(frequencyHz > 0) || !(magnitudes[index] > 0)) return;
      const info = midiLabel(frequencyHz);
      const peak = byMidi.get(info.midi) || { ...info, frequencyHz, strength: 0 };
      peak.strength += magnitudes[index];
      byMidi.set(info.midi, peak);
    });
    const ranked = [...byMidi.values()].sort((a, b) => b.strength - a.strength);
    const maximum = ranked[0]?.strength || 1;
    const notes = ranked.map((peak) => ({ ...peak, strength: peak.strength / maximum }));
    const rawSpectrum = Array.from(essentia.vectorToArray(spectrum.spectrum), Number);
    const spectrumMaximum = Math.max(...rawSpectrum.filter(Number.isFinite), 1e-9);
    const spectrumBins = Array.from({ length: 256 }, (_, index) => {
      const frequency = 32.7 * (5000 / 32.7) ** (index / 255);
      const bin = Math.min(rawSpectrum.length - 1, Math.round(frequency * WINDOW_SIZE / TARGET_RATE));
      return Math.sqrt(Math.max(0, rawSpectrum[bin] || 0) / spectrumMaximum);
    });
    self.postMessage({ type: 'harmony', timestampMs, chroma, pitchHz, pitchConfidence, spectrumBins,
      bassPeaks: notes.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: notes.filter((peak) => peak.midi >= 60).slice(0, 8),
      spectralPeaks: notes.slice(0, 12) });
  } finally {
    hpcp?.hpcp?.delete?.(); peaks?.frequencies?.delete?.(); peaks?.magnitudes?.delete?.();
    spectrum?.spectrum?.delete?.(); windowed?.frame?.delete?.(); vector?.delete?.();
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      await loadEssentia();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (data.type !== 'frame' || !essentia) return;
    const samples = resample(data.samples, data.sampleRate);
    for (let index = 0; index < samples.length; index++) {
      ring[writeIndex] = samples[index];
      writeIndex = (writeIndex + 1) % WINDOW_SIZE;
      filled = Math.min(WINDOW_SIZE, filled + 1);
      samplesSinceAnalysis++;
    }
    if (filled === WINDOW_SIZE && samplesSinceAnalysis >= WINDOW_SIZE) {
      samplesSinceAnalysis = 0;
      // Window centre on the AudioContext timeline; null (never NaN) if the
      // capture side did not provide a timestamp.
      const windowCentreMs = Number.isFinite(data.timestampMs)
        ? data.timestampMs - WINDOW_SIZE / TARGET_RATE * 500 : null;
      analyzeWindow(windowCentreMs);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
