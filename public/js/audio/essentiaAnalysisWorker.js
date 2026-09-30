import { matchChordTemplate } from './chordTemplateMatch.js';
import { buildHarmonicRegions } from './harmonicSegmentation.js';
import { buildBeatGrid } from './beatGrid.js';
import { buildPostBeatWindows } from './beatHarmony.js';
import { detectSilenceFrames, summarizeSilenceWindow } from './silenceGate.js';

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

function estimateChordEvents(essentia, pcm44100, detectedBeatSeconds, durationMs, bpm, rhythmConfidence = 0, detectedOnsets = []) {
  const beatSeconds = buildBeatGrid(detectedBeatSeconds, durationMs, bpm);
  const frameSize = 4096;
  const hopSize = 2048;
  const chromaFrames = [];
  for (let offset = 0; offset + frameSize <= pcm44100.length; offset += hopSize) {
    const startSec = (offset + frameSize / 2) / 44100;
    let squareSum = 0;
    for (let sampleIndex = offset; sampleIndex < offset + frameSize; sampleIndex++) {
      squareSum += pcm44100[sampleIndex] * pcm44100[sampleIndex];
    }
    const rms = Math.sqrt(squareSum / frameSize);
    let frame, windowed, spectrum, peaks, hpcp;
    try {
      frame = essentia.arrayToVector(pcm44100.slice(offset, offset + frameSize));
      windowed = essentia.Windowing(frame, true, frameSize, 'hann', 0, true);
      spectrum = essentia.Spectrum(windowed.frame, frameSize);
      peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.00002, 5000, 120, 40, 'frequency', 44100);
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
      chromaFrames.push({ timeSec: startSec, chroma, spectralPeaks, rms });
    } catch {
      // One malformed/empty FFT window must not discard the rest of a song.
      chromaFrames.push({ timeSec: startSec, chroma: Array(12).fill(0), spectralPeaks: [], rms });
    } finally {
      hpcp?.hpcp?.delete?.(); peaks?.frequencies?.delete?.(); peaks?.magnitudes?.delete?.();
      spectrum?.spectrum?.delete?.(); windowed?.frame?.delete?.(); frame?.delete?.();
    }
  }

  const silence = detectSilenceFrames(chromaFrames);
  chromaFrames.forEach((frame, index) => {
    frame.isSilence = silence.mask[index];
    if (frame.isSilence) {
      frame.chroma = Array(12).fill(0);
      frame.spectralPeaks = [];
    }
  });

  const events = [];
  const candidates = [];
  // Keep a compact ~4.6 Hz spectral trace so the UI can draw a full-song
  // spectrogram and follow the playhead without retaining every FFT frame.
  const maxRms = chromaFrames.reduce((maximum, frame) => Math.max(maximum, frame.rms || 0), 1e-6);
  const spectralFrames = chromaFrames.filter((_, frameIndex) => frameIndex % 2 === 0).map((frame) => {
    const maximum = frame.spectralPeaks[0]?.magnitude || 1;
    return { timeMs: Math.round(frame.timeSec * 1000), rms: frame.rms || 0, isSilence: frame.isSilence,
      level: Math.sqrt(Math.max(0, frame.rms || 0) / maxRms), peaks: frame.spectralPeaks.slice(0, 24).map((peak) => ({
      midi: peak.midi, note: peak.note, frequencyHz: Math.round(peak.frequencyHz),
      strength: Math.round(peak.magnitude / maximum * 1000) / 1000,
    })) };
  });
  const beatWindows = buildPostBeatWindows(chromaFrames, beatSeconds, durationMs);
  for (const window of beatWindows) {
    const { frames } = window;
    const silenceWindow = summarizeSilenceWindow(frames);
    const isSilence = silenceWindow.isSilence;
    const soundingFrames = silenceWindow.activeFrames;
    const chroma = isSilence ? Array(12).fill(0) : Array.from({ length: 12 }, (_, pitch) =>
      soundingFrames.reduce((sum, frame) => sum + frame.chroma[pitch], 0) / soundingFrames.length);
    const bassEnergyByPitch = new Map();
    for (const frame of soundingFrames) for (const peak of frame.spectralPeaks) {
      if (peak.midi >= 55) continue;
      const pitchClass = ((peak.midi % 12) + 12) % 12;
      bassEnergyByPitch.set(pitchClass, (bassEnergyByPitch.get(pitchClass) || 0) + peak.magnitude);
    }
    const bassGuide = [...bassEnergyByPitch].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    const guess = matchChordTemplate(chroma, { minScore: 0.43, minMargin: 0.025, bassPitchClass: bassGuide });
    const maxChroma = Math.max(...chroma, 1e-9);
    const normalizedChroma = chroma.map((value) => value / maxChroma);
    const noteEnergy = new Map();
    for (const frame of soundingFrames) for (const peak of frame.spectralPeaks) {
      const energy = noteEnergy.get(peak.midi) || { ...peak, magnitude: 0 };
      energy.magnitude += peak.magnitude;
      noteEnergy.set(peak.midi, energy);
    }
    const rankedNotes = [...noteEnergy.values()].sort((a, b) => b.magnitude - a.magnitude);
    const maxMagnitude = rankedNotes[0]?.magnitude || 1;
    const pitches = rankedNotes.map((peak) => ({ ...peak, strength: peak.magnitude / maxMagnitude }));
    const pitchClasses = isSilence ? [] : chroma.map((energy, pitch) => ({ pitch: NOTE_NAMES[pitch], energy }))
      .sort((left, right) => right.energy - left.energy);
    const candidateTemplate = guess.alternatives?.[0];
    const candidateTones = candidateTemplate?.tones || [];
    const supportedChordTones = candidateTones.filter((pitch) => normalizedChroma[pitch] >= .1);
    const missingChordTones = candidateTones.filter((pitch) => normalizedChroma[pitch] < .1);
    const evidence = { method: 'post-beat harmonic reanalysis', beatIndex: window.index + 1,
      analysisStartMs: window.analysisStartMs, transientSkippedMs: window.transientSkippedMs,
      analyzedFrames: frames.length, analyzedDurationMs: Math.max(0, Math.round((frames.at(-1).timeSec - frames[0].timeSec) * 1000)),
      strongestPitchClasses: pitchClasses.slice(0, 5).map((item) => item.pitch),
      bassNotes: pitches.filter((peak) => peak.midi < 60).slice(0, 4).map((peak) => peak.note),
      bassGuide: bassGuide === null ? null : NOTE_NAMES[bassGuide], tempoBpm: Number(bpm.toFixed(2)),
      rhythmConfidence: Number(rhythmConfidence.toFixed(3)),
      onsetNearBeat: (detectedOnsets || []).some((time) => Math.abs(time * 1000 - window.startMs) <= 100),
      score: Number(guess.score.toFixed(3)), margin: Number(guess.margin.toFixed(3)),
      candidateTones: candidateTones.map((pitch) => NOTE_NAMES[pitch]),
      supportedChordTones: supportedChordTones.map((pitch) => NOTE_NAMES[pitch]),
      missingChordTones: missingChordTones.map((pitch) => NOTE_NAMES[pitch]),
      chordCoverage: Number(candidateTemplate?.coverage || 0),
      supportedToneCount: candidateTemplate?.supportedTones || 0,
      closeAlternatives: (guess.alternatives || []).slice(0, 3).map(({ symbol, score }) => ({ symbol, score })) };
    const candidate = { symbol: isSilence ? null : guess.symbol, startMs: window.startMs,
      endMs: window.endMs, confidence: isSilence ? 0 : guess.score, margin: isSilence ? 0 : guess.margin,
      accepted: !isSilence && guess.accepted, selectedSymbol: '', isSilence, state: isSilence ? 'silence' : 'harmony',
      silenceThresholdRms: silence.thresholdRms, rms: frames.reduce((sum, frame) => sum + (frame.rms || 0), 0) / Math.max(1, frames.length),
      alternatives: isSilence ? [] : guess.alternatives || [], chroma: normalizedChroma,
      spectralPeaks: isSilence ? [] : pitches.slice(0, 32), bassPeaks: isSilence ? [] : pitches.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: isSilence ? [] : pitches.filter((peak) => peak.midi >= 60).slice(0, 8),
      evidence: { ...evidence, isSilence, silentFrames: silenceWindow.silentFrames,
        activeFrames: soundingFrames.length, silenceRatio: Number(silenceWindow.silenceRatio.toFixed(3)),
        silenceThresholdRms: silence.thresholdRms }, beatIndex: window.index, analysisStartMs: window.analysisStartMs,
      transientSkippedMs: window.transientSkippedMs };
    candidates.push(candidate);
    if (guess.accepted) events.push(candidate);
  }
  const harmonicRegions = buildHarmonicRegions(chromaFrames, durationMs, bpm,
    { silenceThresholdRms: silence.thresholdRms });
  return { events, candidates, harmonicRegions, spectralFrames };
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
      let chordSuggestions = [], chordCandidates = [], harmonicRegions = [], spectralFrames = [];
      try {
        ({ events: chordSuggestions, candidates: chordCandidates, harmonicRegions, spectralFrames } = estimateChordEvents(essentia, pcm44100, beats,
          Math.round(pcm44100.length / 44100 * 1000), Number(rhythm.bpm), Number(rhythm.confidence) || 0, onsets));
      }
      catch (error) { self.postMessage({ type: 'warning', message: `Análisis de acordes no disponible: ${error?.message || String(error)}` }); }
      self.postMessage({ type: 'analysis', version: essentia.version, sampleRate: 44100,
        durationMs: Math.round(pcm44100.length / 44100 * 1000), bpm: Number(rhythm.bpm),
        rhythmConfidence: Number(rhythm.confidence) || 0, beats, onsets, onsetRate, chordSuggestions, chordCandidates, harmonicRegions, harmonicSegmentationVersion: 5, spectralFrames });
      rhythm.ticks?.delete?.(); rhythm.bpmIntervals?.delete?.(); rhythm.estimates?.delete?.();
    } finally {
      signal?.delete?.();
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
  }
};
