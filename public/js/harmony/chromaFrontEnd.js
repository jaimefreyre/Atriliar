import { createRealFFT, hannWindow } from './fft.js';
import {
  LOG_BINS, createLogFreqKernel, logFreqSpectrum, accumulateTuning, estimateTuning,
  tuneAndWhiten, createNoteDictionary, solveNNLS, linearSemitones, semitonesToChroma,
} from './nnlsChroma.js';

const extractorCache = new Map();

/** FFT, kernel and dictionary for one (sampleRate, frameSize); built once and reused. */
export function getChromaExtractor({ sampleRate = 44100, frameSize = 16384 } = {}) {
  const key = `${sampleRate}:${frameSize}`;
  if (!extractorCache.has(key)) {
    extractorCache.set(key, {
      sampleRate, frameSize,
      fft: createRealFFT(frameSize),
      window: hannWindow(frameSize),
      kernel: createLogFreqKernel({ sampleRate, frameSize }),
      dictionary: createNoteDictionary(),
    });
  }
  return extractorCache.get(key);
}

function frameAt(pcm, centerSample, frameSize, window, out) {
  const start = centerSample - frameSize / 2;
  for (let n = 0; n < frameSize; n++) {
    const index = start + n;
    out[n] = index >= 0 && index < pcm.length ? pcm[index] * window[n] : 0;
  }
  return out;
}

function rmsAround(pcm, centerSample, halfWidth) {
  let sum = 0, count = 0;
  for (let index = Math.max(0, centerSample - halfWidth); index < Math.min(pcm.length, centerSample + halfWidth); index++) {
    sum += pcm[index] * pcm[index];
    count++;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

/**
 * Harmony frames for a whole signal: one frame per hop, centred on
 * hop·index. Two passes so the tuning estimate covers the entire song.
 * @returns {{sampleRate:number, frameSize:number, hopSize:number, hopMs:number, count:number,
 *   treble:Float32Array, bass:Float32Array, rms:Float32Array, tuning:{bins:number,cents:number,referenceHz:number}}}
 *   treble/bass are count×12 row-major, C-based pitch classes.
 */
export function computeHarmonyFrames(pcm, sampleRate, {
  frameSize = 16384, hopSize = 2048, useNNLS = true, onProgress = null, shouldCancel = null,
} = {}) {
  const extractor = getChromaExtractor({ sampleRate, frameSize });
  const count = Math.max(1, Math.ceil(pcm.length / hopSize));
  const logSpectra = new Float32Array(count * LOG_BINS);
  const rms = new Float32Array(count);
  const frame = new Float32Array(frameSize);
  const magnitudes = new Float32Array(frameSize / 2 + 1);
  const tuningSums = new Float64Array(3);
  const reportEvery = Math.max(1, Math.floor(count / 20));
  for (let index = 0; index < count; index++) {
    if (shouldCancel?.()) throw new DOMException('Análisis cancelado', 'AbortError');
    const center = index * hopSize;
    extractor.fft.magnitude(frameAt(pcm, center, frameSize, extractor.window, frame), magnitudes);
    const log = logSpectra.subarray(index * LOG_BINS, (index + 1) * LOG_BINS);
    logFreqSpectrum(magnitudes, extractor.kernel, log);
    accumulateTuning(log, tuningSums);
    rms[index] = rmsAround(pcm, center, hopSize / 2);
    if (onProgress && index % reportEvery === 0) onProgress(0.5 * (index / count));
  }
  const tuning = estimateTuning(tuningSums);
  const treble = new Float32Array(count * 12);
  const bass = new Float32Array(count * 12);
  const whitened = new Float32Array(LOG_BINS);
  let previous = null;
  for (let index = 0; index < count; index++) {
    if (shouldCancel?.()) throw new DOMException('Análisis cancelado', 'AbortError');
    tuneAndWhiten(logSpectra.subarray(index * LOG_BINS, (index + 1) * LOG_BINS), tuning.bins, {}, whitened);
    const semitones = useNNLS
      ? solveNNLS(extractor.dictionary, whitened, { warmStart: previous })
      : linearSemitones(whitened);
    previous = useNNLS ? semitones : null;
    semitonesToChroma(semitones, treble.subarray(index * 12, index * 12 + 12), bass.subarray(index * 12, index * 12 + 12));
    if (onProgress && index % reportEvery === 0) onProgress(0.5 + 0.5 * (index / count));
  }
  onProgress?.(1);
  return { sampleRate, frameSize, hopSize, hopMs: (hopSize / sampleRate) * 1000, count, treble, bass, rms, tuning };
}

/**
 * The same front end, one window at a time, for live input at the context's
 * native rate (no resampling). Tuning accumulates over the session and NNLS
 * warm-starts from the previous window.
 * @returns {{frameSize:number, analyze:(window:Float32Array)=>{treble:Float32Array, bass:Float32Array, rms:number}, reset:()=>void}}
 */
export function createLiveChromaAnalyzer({ sampleRate, frameSize = 8192 }) {
  const extractor = getChromaExtractor({ sampleRate, frameSize });
  const frame = new Float32Array(frameSize);
  const magnitudes = new Float32Array(frameSize / 2 + 1);
  const log = new Float32Array(LOG_BINS);
  const whitened = new Float32Array(LOG_BINS);
  let tuningSums = new Float64Array(3);
  let previous = null;
  function analyze(samples) {
    if (samples.length !== frameSize) throw new RangeError(`La ventana debe tener ${frameSize} muestras.`);
    let sum = 0;
    for (let n = 0; n < frameSize; n++) { frame[n] = samples[n] * extractor.window[n]; sum += samples[n] * samples[n]; }
    extractor.fft.magnitude(frame, magnitudes);
    logFreqSpectrum(magnitudes, extractor.kernel, log);
    accumulateTuning(log, tuningSums);
    tuneAndWhiten(log, estimateTuning(tuningSums).bins, {}, whitened);
    const semitones = solveNNLS(extractor.dictionary, whitened, { warmStart: previous });
    previous = semitones;
    const treble = new Float32Array(12), bass = new Float32Array(12);
    semitonesToChroma(semitones, treble, bass);
    return { treble, bass, rms: Math.sqrt(sum / frameSize) };
  }
  function reset() { tuningSums = new Float64Array(3); previous = null; }
  return { frameSize, analyze, reset };
}

/** 8-bit storage: each frame keeps one scale per register (≈200 KB per 5 minutes). */
export function quantizeHarmonyFrames(frames) {
  const { count } = frames;
  const treble = new Uint8Array(count * 12);
  const bass = new Uint8Array(count * 12);
  const trebleScale = new Float32Array(count);
  const bassScale = new Float32Array(count);
  const pack = (source, target, scales) => {
    for (let index = 0; index < count; index++) {
      let max = 0;
      for (let pc = 0; pc < 12; pc++) max = Math.max(max, source[index * 12 + pc]);
      scales[index] = max;
      for (let pc = 0; pc < 12; pc++) target[index * 12 + pc] = max > 0 ? Math.round((source[index * 12 + pc] / max) * 255) : 0;
    }
  };
  pack(frames.treble, treble, trebleScale);
  pack(frames.bass, bass, bassScale);
  return { sampleRate: frames.sampleRate, frameSize: frames.frameSize, hopSize: frames.hopSize, hopMs: frames.hopMs,
    count, tuning: frames.tuning, rms: Float32Array.from(frames.rms), treble, bass, trebleScale, bassScale };
}

export function dequantizeHarmonyFrames(stored) {
  const { count } = stored;
  const unpack = (source, scales) => {
    const out = new Float32Array(count * 12);
    for (let index = 0; index < count; index++) {
      for (let pc = 0; pc < 12; pc++) out[index * 12 + pc] = (source[index * 12 + pc] / 255) * scales[index];
    }
    return out;
  };
  return { sampleRate: stored.sampleRate, frameSize: stored.frameSize, hopSize: stored.hopSize, hopMs: stored.hopMs, count,
    tuning: stored.tuning, rms: Float32Array.from(stored.rms), treble: unpack(stored.treble, stored.trebleScale), bass: unpack(stored.bass, stored.bassScale) };
}
