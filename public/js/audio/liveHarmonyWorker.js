import { createLiveChromaAnalyzer } from '../harmony/chromaFrontEnd.js';

// Live harmony for the microphone, at the AudioContext's native rate (no
// resampling): the same NNLS chroma as the offline engine on an 8192-sample
// window every 2048 samples, plus Essentia peaks, pitch (tuner) and a log
// spectrum on the most recent 4096 samples.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WINDOW_SIZE = 8192;
const HOP_SIZE = 2048;
const PEAK_WINDOW = 4096;
let essentia = null;
let analyzer = null;
let analyzerRate = 0;
let ring = new Float32Array(WINDOW_SIZE);
let writeIndex = 0;
let filled = 0;
let sinceAnalysis = 0;

async function loadEssentia() {
  const [core, wasmGlue] = await Promise.all([
    import('../../vendor/essentia/essentia.js-core.es.js'),
    import('../../vendor/essentia/essentia-wasm.es.js'),
  ]);
  essentia = new core.default(wasmGlue.EssentiaWASM);
}

function useRate(sampleRate) {
  if (analyzer && analyzerRate === sampleRate) return;
  analyzer = createLiveChromaAnalyzer({ sampleRate, frameSize: WINDOW_SIZE });
  analyzerRate = sampleRate;
  ring = new Float32Array(WINDOW_SIZE); writeIndex = 0; filled = 0; sinceAnalysis = 0;
}

function midiLabel(frequencyHz) {
  const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  return { midi, note: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}` };
}

const normalized = (values) => {
  const max = Math.max(0, ...values);
  return Array.from(values, (value) => (max > 0 ? value / max : 0));
};

/** Peaks, pitch and display spectrum of the most recent samples. */
function spectralView(recent, sampleRate) {
  const vector = essentia.arrayToVector(recent);
  let windowed, spectrum, peaks;
  try {
    windowed = essentia.Windowing(vector, true, PEAK_WINDOW, 'hann', 0, true);
    spectrum = essentia.Spectrum(windowed.frame, PEAK_WINDOW);
    peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.00002, 5000, 120, 40, 'frequency', sampleRate);
    let pitchHz = 0, pitchConfidence = 0;
    try {
      const pitch = essentia.PitchYinFFT(spectrum.spectrum, PEAK_WINDOW, true, 1600, 45, sampleRate, 1);
      pitchHz = Number(pitch.pitch) || 0;
      pitchConfidence = Number(pitch.pitchConfidence) || 0;
    } catch { /* The spectrum and chroma remain useful when the tuner has no monophonic pitch. */ }
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
      const bin = Math.min(rawSpectrum.length - 1, Math.round((frequency * PEAK_WINDOW) / sampleRate));
      return Math.sqrt(Math.max(0, rawSpectrum[bin] || 0) / spectrumMaximum);
    });
    return { pitchHz, pitchConfidence, spectrumBins, bassPeaks: notes.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: notes.filter((peak) => peak.midi >= 60).slice(0, 8), spectralPeaks: notes.slice(0, 12) };
  } finally {
    peaks?.frequencies?.delete?.(); peaks?.magnitudes?.delete?.();
    spectrum?.spectrum?.delete?.(); windowed?.frame?.delete?.(); vector?.delete?.();
  }
}

function analyzeWindow(sampleRate, timestampMs) {
  const window = new Float32Array(WINDOW_SIZE);
  for (let index = 0; index < WINDOW_SIZE; index++) window[index] = ring[(writeIndex + index) % WINDOW_SIZE];
  const { treble, bass, rms } = analyzer.analyze(window);
  self.postMessage({ type: 'harmony', timestampMs, sampleRate, rms, chroma: normalized(treble), bassChroma: normalized(bass),
    ...spectralView(window.slice(WINDOW_SIZE - PEAK_WINDOW), sampleRate) });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      await loadEssentia();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (data.type !== 'frame' || !essentia || !(data.sampleRate > 0)) return;
    useRate(data.sampleRate);
    const { samples } = data;
    for (let index = 0; index < samples.length; index++) {
      ring[writeIndex] = samples[index];
      writeIndex = (writeIndex + 1) % WINDOW_SIZE;
      filled = Math.min(WINDOW_SIZE, filled + 1);
      sinceAnalysis++;
    }
    if (filled === WINDOW_SIZE && sinceAnalysis >= HOP_SIZE) {
      sinceAnalysis = 0;
      // Window centre on the AudioContext timeline; null (never NaN) if the
      // capture side did not provide a timestamp.
      const windowCentreMs = Number.isFinite(data.timestampMs) ? data.timestampMs - (WINDOW_SIZE / data.sampleRate) * 500 : null;
      analyzeWindow(data.sampleRate, windowCentreMs);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
