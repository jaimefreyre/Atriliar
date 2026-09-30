const DEFAULTS = {
  absoluteRmsFloor: 0.00001,
  relativeRmsFloor: 0.003,
  minSilenceMs: 180,
};

function frameSpacingMs(frames) {
  const gaps = [];
  for (let index = 1; index < frames.length; index++) {
    const gap = (frames[index].timeSec - frames[index - 1].timeSec) * 1000;
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  if (!gaps.length) return 46;
  gaps.sort((left, right) => left - right);
  return gaps[Math.floor(gaps.length / 2)];
}

function withDefaults(options) {
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(options || {}).filter(([, value]) => value !== undefined)) };
}

function hasHarmonicEvidence(frame) {
  const chromaEnergy = (frame.chroma || []).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return chromaEnergy > 1e-10 || (frame.spectralPeaks || []).some((peak) => Number(peak.magnitude) > 0);
}

export function estimateSilenceThreshold(frames, options = {}) {
  const config = withDefaults(options);
  const levels = (frames || []).map((frame) => frame.rms)
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!levels.length) return null;
  const peakRms = Math.max(...levels);
  return Math.max(config.absoluteRmsFloor, peakRms * config.relativeRmsFloor);
}

/**
 * Detect sustained low-energy spans. The short-duration requirement prevents
 * a single soft attack or a quiet FFT frame from breaking a harmonic region.
 */
export function detectSilenceFrames(frames, options = {}) {
  const config = withDefaults(options);
  const source = Array.isArray(frames) ? frames : [];
  const spacingMs = Number.isFinite(config.spacingMs) && config.spacingMs > 0
    ? config.spacingMs : frameSpacingMs(source);
  const thresholdRms = Number.isFinite(config.thresholdRms)
    ? config.thresholdRms : estimateSilenceThreshold(source, config);
  const candidate = source.map((frame) => frame.isSilence === true || (Number.isFinite(frame.rms)
    ? frame.rms <= (thresholdRms ?? config.absoluteRmsFloor)
    : !hasHarmonicEvidence(frame)));
  const minFrames = Math.max(1, Math.ceil(config.minSilenceMs / spacingMs));
  const mask = Array(source.length).fill(false);
  for (let index = 0; index < candidate.length;) {
    if (!candidate[index]) { index++; continue; }
    let end = index + 1;
    while (end < candidate.length && candidate[end]) end++;
    if (end - index >= minFrames) {
      for (let cursor = index; cursor < end; cursor++) mask[cursor] = true;
    }
    index = end;
  }
  return { mask, thresholdRms, spacingMs, minFrames };
}
