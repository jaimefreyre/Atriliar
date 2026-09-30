// Essentia's own ChordsDetectionBeats (HPCP + major/minor templates between
// beats) as a neutral reference for the evaluation harness. Not used by the app.

import { computePeakFrames } from '../../public/js/audio/analysisPipeline.js';

/** @returns {{'chords-beats':Array}} segments {startMs, endMs, symbol} */
export function runEssentiaChordsBeats(essentia, { pcm44100, beatsSec, durationMs }) {
  const peakFrames = computePeakFrames(essentia, pcm44100, { withHpcp: true });
  const pcp = new essentia.module.VectorVectorFloat();
  for (const frame of peakFrames) pcp.push_back(essentia.arrayToVector(Float32Array.from(frame.hpcpA)));
  const ticks = [...beatsSec].filter(Number.isFinite).sort((a, b) => a - b);
  const tickVector = essentia.arrayToVector(Float32Array.from(ticks));
  try {
    const result = essentia.ChordsDetectionBeats(pcp, tickVector, 'interbeat_median', 2048, 44100);
    const segments = [];
    if (ticks[0] > 0) segments.push({ startMs: 0, endMs: Math.round(ticks[0] * 1000), symbol: null });
    for (let index = 0; index < result.chords.size() && index + 1 < ticks.length; index++) {
      const symbol = result.chords.get(index);
      segments.push({ startMs: Math.round(ticks[index] * 1000), endMs: Math.round(ticks[index + 1] * 1000), symbol: symbol && symbol !== 'N' ? symbol : null });
    }
    const lastMs = Math.round(ticks.at(-1) * 1000);
    if (lastMs < durationMs) segments.push({ startMs: lastMs, endMs: durationMs, symbol: null });
    result.chords.delete?.(); result.strength?.delete?.();
    return { 'chords-beats': segments };
  } finally {
    tickVector.delete?.(); pcp.delete?.();
  }
}
