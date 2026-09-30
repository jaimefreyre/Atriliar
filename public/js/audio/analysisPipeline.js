import { computeHarmonyFrames } from '../harmony/chromaFrontEnd.js';
import { buildHarmonyTrack, harmonyStepsFor } from '../harmony/harmonyTrack.js';
import { syncAnalysisViews } from '../harmony/analysisHarmony.js';
import { detectSilenceFrames } from './silenceGate.js';

// The offline audio analysis, shared by the analysis Worker and the Node
// evaluation harness. Essentia is passed in (never imported here) so the
// same code runs with the browser build and with the Node shims:
//   rhythm   → Essentia RhythmExtractor2013 + OnsetRate
//   harmony  → the v6 track (JS NNLS chroma + beat-synchronous HMM)
//   peaks    → Essentia spectral peaks for the spectrogram and MIDI voices
//   evidence → what sounded on each beat, next to the chord the track decided

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PEAK_FRAME_SIZE = 4096;
const PEAK_HOP_SIZE = 2048;
export const ANALYSIS_SAMPLE_RATE = 44100;

function describeMidi(midi) {
  const rounded = Math.round(midi);
  return { midi: rounded, note: `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}` };
}

export function resampleTo44100(signal, sourceRate) {
  if (sourceRate === ANALYSIS_SAMPLE_RATE) return signal;
  const targetLength = Math.round((signal.length * ANALYSIS_SAMPLE_RATE) / sourceRate);
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / ANALYSIS_SAMPLE_RATE;
  for (let index = 0; index < targetLength; index++) {
    const at = index * ratio;
    const left = Math.floor(at);
    const mix = at - left;
    const a = signal[Math.min(left, signal.length - 1)] || 0;
    const b = signal[Math.min(left + 1, signal.length - 1)] || 0;
    output[index] = a + (b - a) * mix;
  }
  return output;
}

/** Tempo, beats and onsets. */
export function analyzeRhythm(essentia, pcm44100, { onWarning = () => {} } = {}) {
  const signal = essentia.arrayToVector(pcm44100);
  try {
    const rhythm = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40);
    const result = { beats: Array.from(essentia.vectorToArray(rhythm.ticks), Number), bpm: Number(rhythm.bpm),
      rhythmConfidence: Number(rhythm.confidence) || 0, onsets: [], onsetRate: 0 };
    rhythm.ticks?.delete?.(); rhythm.bpmIntervals?.delete?.(); rhythm.estimates?.delete?.();
    try {
      const onsetResult = essentia.OnsetRate(signal);
      result.onsets = Array.from(essentia.vectorToArray(onsetResult.onsets), Number);
      result.onsetRate = Number(onsetResult.onsetRate) || 0;
      onsetResult.onsets?.delete?.();
    } catch (error) {
      onWarning(`OnsetRate no disponible: ${error.message}`);
    }
    return result;
  } finally {
    signal?.delete?.();
  }
}

/**
 * Spectral peaks per 4096/2048 frame (plus Essentia HPCP when asked, for the
 * ChordsDetectionBeats baseline of the evaluation harness).
 * @returns {Array<{timeSec:number, rms:number, spectralPeaks:Array, hpcpA?:number[]}>}
 */
export function computePeakFrames(essentia, pcm44100, { withHpcp = false, onProgress = null } = {}) {
  const frames = [];
  const total = Math.max(1, Math.floor((pcm44100.length - PEAK_FRAME_SIZE) / PEAK_HOP_SIZE) + 1);
  const reportEvery = Math.max(1, Math.round(total / 20));
  for (let offset = 0, index = 0; offset + PEAK_FRAME_SIZE <= pcm44100.length; offset += PEAK_HOP_SIZE, index++) {
    const timeSec = (offset + PEAK_FRAME_SIZE / 2) / ANALYSIS_SAMPLE_RATE;
    let squareSum = 0;
    for (let sample = offset; sample < offset + PEAK_FRAME_SIZE; sample++) squareSum += pcm44100[sample] * pcm44100[sample];
    const rms = Math.sqrt(squareSum / PEAK_FRAME_SIZE);
    let frame, windowed, spectrum, peaks, hpcp;
    try {
      frame = essentia.arrayToVector(pcm44100.slice(offset, offset + PEAK_FRAME_SIZE));
      windowed = essentia.Windowing(frame, true, PEAK_FRAME_SIZE, 'hann', 0, true);
      spectrum = essentia.Spectrum(windowed.frame, PEAK_FRAME_SIZE);
      peaks = essentia.SpectralPeaks(spectrum.spectrum, 0.00002, 5000, 120, 40, 'frequency', ANALYSIS_SAMPLE_RATE);
      const frequencies = Array.from(essentia.vectorToArray(peaks.frequencies), Number);
      const magnitudes = Array.from(essentia.vectorToArray(peaks.magnitudes), Number);
      const spectralPeaks = frequencies.flatMap((frequencyHz, peakIndex) => {
        if (!(frequencyHz > 0) || !Number.isFinite(magnitudes[peakIndex])) return [];
        return [{ ...describeMidi(69 + 12 * Math.log2(frequencyHz / 440)), frequencyHz, magnitude: magnitudes[peakIndex] }];
      }).sort((a, b) => b.magnitude - a.magnitude).slice(0, 24);
      const entry = { timeSec, rms, spectralPeaks };
      if (withHpcp) {
        // HPCP rejects empty peak vectors; silent frames keep a neutral profile.
        entry.hpcpA = Array(12).fill(0);
        if (frequencies.length && magnitudes.some((magnitude) => magnitude > 0)) {
          hpcp = essentia.HPCP(peaks.frequencies, peaks.magnitudes);
          entry.hpcpA = Array.from(essentia.vectorToArray(hpcp.hpcp), Number);
        }
      }
      frames.push(entry);
    } catch {
      // One malformed window must not discard the rest of the song.
      frames.push({ timeSec, rms, spectralPeaks: [], ...(withHpcp ? { hpcpA: Array(12).fill(0) } : {}) });
    } finally {
      hpcp?.hpcp?.delete?.(); peaks?.frequencies?.delete?.(); peaks?.magnitudes?.delete?.();
      spectrum?.spectrum?.delete?.(); windowed?.frame?.delete?.(); frame?.delete?.();
    }
    if (onProgress && index % reportEvery === 0) onProgress(index / total);
  }
  const silence = detectSilenceFrames(frames);
  frames.forEach((frame, index) => {
    frame.isSilence = silence.mask[index];
    if (frame.isSilence) frame.spectralPeaks = [];
  });
  frames.silenceThresholdRms = silence.thresholdRms;
  return frames;
}

/** Compact ~10 Hz spectral trace for the spectrogram and the MIDI voices. */
export function buildSpectralTrace(frames) {
  const maxRms = frames.reduce((maximum, frame) => Math.max(maximum, frame.rms || 0), 1e-6);
  return frames.filter((_, index) => index % 2 === 0).map((frame) => {
    const maximum = frame.spectralPeaks[0]?.magnitude || 1;
    return { timeMs: Math.round(frame.timeSec * 1000), rms: frame.rms || 0, isSilence: frame.isSilence,
      level: Math.sqrt(Math.max(0, frame.rms || 0) / maxRms),
      peaks: frame.spectralPeaks.slice(0, 24).map((peak) => ({ midi: peak.midi, note: peak.note, frequencyHz: Math.round(peak.frequencyHz),
        strength: Math.round((peak.magnitude / maximum) * 1000) / 1000 })) };
  });
}

/** Group the track's steps into windows about one beat long (a fixed 250 ms grid has several per beat). */
function beatWindows(grid, steps) {
  const windows = [];
  const perWindow = grid.kind === 'fixed' ? Math.max(1, Math.round(grid.stepsPerBeat)) : Infinity;
  for (const step of steps) {
    const last = windows.at(-1);
    const sameBeat = grid.kind === 'fixed' ? last && last.steps.length < perWindow : last && last.beatIndex === step.beatIndex;
    if (sameBeat) { last.steps.push(step); last.endMs = step.endMs; }
    else windows.push({ beatIndex: windows.length, startMs: step.startMs, endMs: step.endMs, steps: [step] });
  }
  return windows;
}

/**
 * What sounded on each beat, for the read-only "evidencia por golpe" view:
 * the track's own chroma for the beat, the spectral peaks after the attack and
 * the chord the harmony track decided there (filled by syncAnalysisViews).
 */
export function buildBeatEvidence({ harmony, peakFrames, bpm, rhythmConfidence, onsets = [] }) {
  const { grid, steps } = harmonyStepsFor(harmony);
  return beatWindows(grid, steps).map((window) => {
    const isSilence = window.steps.every((step) => step.silentFraction >= 0.65);
    const chroma = Array(12).fill(0);
    for (const step of window.steps) for (let pc = 0; pc < 12; pc++) chroma[pc] += step.treble[pc] / window.steps.length;
    const maxChroma = Math.max(...chroma, 1e-9);
    const settleMs = Math.min(90, 0.2 * (window.endMs - window.startMs));
    const sounding = peakFrames.filter((frame) => frame.timeSec * 1000 >= window.startMs + settleMs && frame.timeSec * 1000 < window.endMs && !frame.isSilence);
    const energy = new Map();
    for (const frame of sounding) for (const peak of frame.spectralPeaks) {
      const entry = energy.get(peak.midi) || { ...peak, magnitude: 0 };
      entry.magnitude += peak.magnitude;
      energy.set(peak.midi, entry);
    }
    const ranked = [...energy.values()].sort((a, b) => b.magnitude - a.magnitude);
    const strongest = ranked[0]?.magnitude || 1;
    const pitches = isSilence ? [] : ranked.map((peak) => ({ ...peak, strength: peak.magnitude / strongest }));
    const pitchClasses = chroma.map((value, pc) => ({ pitch: NOTE_NAMES[pc], value })).sort((a, b) => b.value - a.value);
    return {
      symbol: null, startMs: window.startMs, endMs: window.endMs, beatIndex: window.beatIndex, isSilence, state: isSilence ? 'silence' : 'harmony',
      selectedSymbol: '', confidence: 0, accepted: false, alternatives: [],
      chroma: isSilence ? Array(12).fill(0) : chroma.map((value) => Number((value / maxChroma).toFixed(3))),
      rms: sounding.reduce((sum, frame) => sum + frame.rms, 0) / Math.max(1, sounding.length),
      spectralPeaks: pitches.slice(0, 32), bassPeaks: pitches.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: pitches.filter((peak) => peak.midi >= 60).slice(0, 8),
      analysisStartMs: Math.round(window.startMs + settleMs), transientSkippedMs: Math.round(settleMs),
      evidence: { method: 'beat-evidence', beatIndex: window.beatIndex + 1, steps: window.steps.length, analyzedFrames: sounding.length,
        tempoBpm: Number((bpm || 0).toFixed(2)), rhythmConfidence: Number((rhythmConfidence || 0).toFixed(3)),
        onsetNearBeat: onsets.some((time) => Math.abs(time * 1000 - window.startMs) <= 100),
        strongestPitchClasses: isSilence ? [] : pitchClasses.filter((item) => item.value / maxChroma >= 0.3).slice(0, 5).map((item) => item.pitch),
        bassNotes: pitches.filter((peak) => peak.midi < 60).slice(0, 4).map((peak) => peak.note), isSilence },
    };
  });
}

/**
 * The whole offline analysis of one mono signal.
 * @param {object} essentia an initialised Essentia.js instance
 * @param {{pcm:Float32Array, sampleRate:number, sensitivity?:string, constraints?:Array,
 *   onProgress?:(progress:{stage:string, fraction:number})=>void, onWarning?:(message:string)=>void}} input
 */
export function analyzeAudio(essentia, { pcm, sampleRate, sensitivity, constraints = [], onProgress = () => {}, onWarning = () => {} }) {
  const pcm44100 = resampleTo44100(pcm, sampleRate);
  const durationMs = Math.round((pcm44100.length / ANALYSIS_SAMPLE_RATE) * 1000);
  onProgress({ stage: 'rhythm', fraction: 0 });
  const rhythm = analyzeRhythm(essentia, pcm44100, { onWarning });
  onProgress({ stage: 'peaks', fraction: 0.3 });
  let peakFrames = [];
  try {
    peakFrames = computePeakFrames(essentia, pcm44100, { onProgress: (fraction) => onProgress({ stage: 'peaks', fraction: 0.3 + 0.25 * fraction }) });
  } catch (error) {
    onWarning(`Picos espectrales no disponibles: ${error?.message || String(error)}`);
  }
  const analysis = { version: essentia.version, sampleRate: ANALYSIS_SAMPLE_RATE, durationMs, ...rhythm,
    spectralFrames: buildSpectralTrace(peakFrames), harmony: null, chordCandidates: [], harmonicRegions: [], chordSuggestions: [] };
  onProgress({ stage: 'harmony', fraction: 0.55 });
  try {
    const frames = computeHarmonyFrames(pcm44100, ANALYSIS_SAMPLE_RATE, { onProgress: (fraction) => onProgress({ stage: 'harmony', fraction: 0.55 + 0.4 * fraction }) });
    analysis.harmony = buildHarmonyTrack({ frames, beatsSec: rhythm.beats, bpm: rhythm.bpm, rhythmConfidence: rhythm.rhythmConfidence,
      durationMs, sensitivity, constraints });
    analysis.chordCandidates = buildBeatEvidence({ harmony: analysis.harmony, peakFrames, bpm: rhythm.bpm,
      rhythmConfidence: rhythm.rhythmConfidence, onsets: rhythm.onsets });
    syncAnalysisViews(analysis);
  } catch (error) {
    // Tempo, beats and the spectrogram are still useful without chords.
    onWarning(`Análisis de acordes no disponible: ${error?.message || String(error)}`);
  }
  onProgress({ stage: 'done', fraction: 1 });
  return analysis;
}
