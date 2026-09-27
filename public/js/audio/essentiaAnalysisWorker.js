import { matchChordTemplate } from './chordTemplateMatch.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
let instance = null;

function describeMidi(midi) {
  const rounded = Math.round(midi);
  return { midi: rounded, note: `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}` };
}

async function loadEssentia() {
  if (instance) return instance;
  // Keep both substantial modules out of the normal app import graph.
  const [core, wasmGlue] = await Promise.all([
    import('../../vendor/essentia/essentia.js-core.es.js'),
    import('../../vendor/essentia/essentia-wasm.es.js'),
  ]);
  // The ESM glue exports the already initialized Emscripten Module object.
  const wasm = wasmGlue.EssentiaWASM;
  instance = new core.default(wasm);
  return instance;
}

function resampleTo44100(signal, sourceRate) {
  if (sourceRate === 44100) return signal;
  const targetLength = Math.round(signal.length * 44100 / sourceRate);
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / 44100;
  for (let i = 0; i < targetLength; i++) {
    const at = i * ratio;
    const left = Math.floor(at);
    const mix = at - left;
    const a = signal[Math.min(left, signal.length - 1)] || 0;
    const b = signal[Math.min(left + 1, signal.length - 1)] || 0;
    output[i] = a + (b - a) * mix;
  }
  return output;
}

function estimateChordEvents(essentia, pcm44100, detectedBeatSeconds, durationMs, bpm) {
  const beatPeriodSec = 60 / bpm;
  const beatSeconds = [...detectedBeatSeconds];
  if (beatSeconds.length && beatSeconds[0] > beatPeriodSec * 0.5 && beatSeconds[0] <= beatPeriodSec * 1.5) {
    beatSeconds.unshift(Math.max(0, beatSeconds[0] - beatPeriodSec));
  }
  if (beatSeconds.length && beatSeconds.at(-1) + beatPeriodSec < durationMs / 1000 + 0.02) {
    beatSeconds.push(Math.min(durationMs / 1000, beatSeconds.at(-1) + beatPeriodSec));
  }
  const frameSize = 4096;
  const hopSize = 2048;
  const chromaFrames = [];
  for (let offset = 0; offset + frameSize <= pcm44100.length; offset += hopSize) {
    const startSec = (offset + frameSize / 2) / 44100;
    let frame, windowed, spectrum, peaks, hpcp;
    try {
      frame = essentia.arrayToVector(pcm44100.slice(offset, offset + frameSize));
      windowed = essentia.Windowing(frame, true, frameSize, 'hann', 0, true);
      spectrum = essentia.Spectrum(windowed.frame, frameSize);
      peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.0001, 5000, 100, 55, 'frequency', 44100);
      const peakFrequencies = Array.from(essentia.vectorToArray(peaks.frequencies), Number);
      const peakMagnitudes = Array.from(essentia.vectorToArray(peaks.magnitudes), Number);
      const spectralPeaks = peakFrequencies.flatMap((frequencyHz, index) => {
        if (!(frequencyHz > 0) || !Number.isFinite(peakMagnitudes[index])) return [];
        const midi = 69 + 12 * Math.log2(frequencyHz / 440);
        return [{ ...describeMidi(midi), frequencyHz, magnitude: peakMagnitudes[index] }];
      }).sort((a, b) => b.magnitude - a.magnitude).slice(0, 24);
      // HPCP rejects empty peak vectors. Silence and very low-level passages
      // are normal in real recordings, so retain a neutral frame and continue.
      let chroma = Array(12).fill(0);
      if (peakFrequencies.length && peakMagnitudes.some((magnitude) => Number.isFinite(magnitude) && magnitude > 0)) {
        hpcp = essentia.HPCP(peaks.frequencies, peaks.magnitudes);
        // Essentia HPCP bins are A..G#; the application contract uses C..B.
        const fromA = Array.from(essentia.vectorToArray(hpcp.hpcp), Number);
        chroma = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map((index) => fromA[index] || 0);
      }
      chromaFrames.push({ timeSec: startSec, chroma, spectralPeaks });
    } catch {
      // One malformed/empty FFT window must not discard the rest of a song.
      chromaFrames.push({ timeSec: startSec, chroma: Array(12).fill(0), spectralPeaks: [] });
    } finally {
      hpcp?.hpcp?.delete?.(); peaks?.frequencies?.delete?.(); peaks?.magnitudes?.delete?.();
      spectrum?.spectrum?.delete?.(); windowed?.frame?.delete?.(); frame?.delete?.();
    }
  }

  const events = [];
  const candidates = [];
  // Keep a compact ~4.6 Hz spectral trace so the UI can draw a full-song
  // spectrogram and follow the playhead without retaining every FFT frame.
  const spectralFrames = chromaFrames.filter((_, frameIndex) => frameIndex % 5 === 0).map((frame) => {
    const maximum = frame.spectralPeaks[0]?.magnitude || 1;
    return { timeMs: Math.round(frame.timeSec * 1000), peaks: frame.spectralPeaks.slice(0, 12).map((peak) => ({
      midi: peak.midi, note: peak.note, frequencyHz: Math.round(peak.frequencyHz),
      strength: Math.round(peak.magnitude / maximum * 1000) / 1000,
    })) };
  });
  for (let index = 0; index + 1 < beatSeconds.length; index++) {
    const startSec = beatSeconds[index];
    const endSec = beatSeconds[index + 1];
    if (!(endSec > startSec)) continue;
    const frames = chromaFrames.filter((frame) => frame.timeSec >= startSec && frame.timeSec < endSec);
    if (!frames.length) continue;
    const chroma = Array.from({ length: 12 }, (_, pitch) =>
      frames.reduce((sum, frame) => sum + frame.chroma[pitch], 0) / frames.length);
    const guess = matchChordTemplate(chroma, { minScore: 0.65, minMargin: 0.08 });
    const maxChroma = Math.max(...chroma, 1e-9);
    const normalizedChroma = chroma.map((value) => value / maxChroma);
    const noteEnergy = new Map();
    for (const frame of frames) for (const peak of frame.spectralPeaks) {
      const energy = noteEnergy.get(peak.midi) || { ...peak, magnitude: 0 };
      energy.magnitude += peak.magnitude;
      noteEnergy.set(peak.midi, energy);
    }
    const rankedNotes = [...noteEnergy.values()].sort((a, b) => b.magnitude - a.magnitude);
    const maxMagnitude = rankedNotes[0]?.magnitude || 1;
    const pitches = rankedNotes.map((peak) => ({ ...peak, strength: peak.magnitude / maxMagnitude }));
    const candidate = { symbol: guess.symbol, startMs: Math.max(0, Math.round(startSec * 1000)),
      endMs: Math.min(durationMs, Math.round(endSec * 1000)), confidence: guess.score, margin: guess.margin,
      accepted: guess.accepted, selectedSymbol: '',
      alternatives: guess.alternatives || [], chroma: normalizedChroma,
      spectralPeaks: pitches.slice(0, 32), bassPeaks: pitches.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: pitches.filter((peak) => peak.midi >= 60).slice(0, 8) };
    candidates.push(candidate);
    if (guess.accepted) events.push(candidate);
  }
  return { events, candidates, spectralFrames };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const essentia = await loadEssentia();
      self.postMessage({ type: 'ready', version: essentia.version,
        rhythm: essentia.algorithmNames.includes('RhythmExtractor2013'),
        onsets: essentia.algorithmNames.includes('OnsetRate') });
      return;
    }
    if (data.type !== 'analyse') return;
    const essentia = await loadEssentia();
    const pcm44100 = resampleTo44100(data.pcm, data.sampleRate);
    const signal = essentia.arrayToVector(pcm44100);
    try {
      const rhythm = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40);
      const beats = Array.from(essentia.vectorToArray(rhythm.ticks), Number);
      let onsets = [];
      let onsetRate = 0;
      try {
        const onsetResult = essentia.OnsetRate(signal);
        onsets = Array.from(essentia.vectorToArray(onsetResult.onsets), Number);
        onsetRate = Number(onsetResult.onsetRate) || 0;
      } catch (error) {
        self.postMessage({ type: 'warning', message: `OnsetRate no disponible: ${error.message}` });
      }
      let chordSuggestions = [], chordCandidates = [], spectralFrames = [];
      try {
        ({ events: chordSuggestions, candidates: chordCandidates, spectralFrames } = estimateChordEvents(essentia, pcm44100, beats,
          Math.round(pcm44100.length / 44100 * 1000), Number(rhythm.bpm)));
      }
      catch (error) { self.postMessage({ type: 'warning', message: `Análisis de acordes no disponible: ${error?.message || String(error)}` }); }
      self.postMessage({ type: 'analysis', version: essentia.version, sampleRate: 44100,
        durationMs: Math.round(pcm44100.length / 44100 * 1000), bpm: Number(rhythm.bpm),
        rhythmConfidence: Number(rhythm.confidence) || 0, beats, onsets, onsetRate, chordSuggestions, chordCandidates, spectralFrames });
      rhythm.ticks?.delete?.(); rhythm.bpmIntervals?.delete?.(); rhythm.estimates?.delete?.();
    } finally {
      signal?.delete?.();
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
  }
};
