import { matchChordTemplate } from './chordTemplateMatch.js';
import { detectSilenceFrames } from './silenceGate.js';

const DEFAULTS = {
  minRegionMs: 900, smoothingMs: 260, changeConfirmMs: 320,
  minSmoothingFrames: 3, minChangeFrames: 2, minRunFrames: 2, minScore: 0.44, minMargin: 0.025,
  minSilenceMs: 180,
};

function normalized(values) {
  const max = Math.max(0, ...values);
  return max > 0 ? values.map((value) => value / max) : values.map(() => 0);
}

// For comparisons, normalize by total energy instead of the loudest pitch.
// Max-normalization overreacts whenever a melody note briefly becomes the
// strongest bin, which makes a busy mix look as if its entire harmony changed.
function normalizedMass(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  return total > 0 ? values.map((value) => Math.max(0, value) / total) : values.map(() => 0);
}

function profileDistance(left, right) {
  const a = normalizedMass(left), b = normalizedMass(right);
  return a.reduce((sum, value, pitch) => sum + Math.abs(value - b[pitch]), 0) / 2;
}

function frameSpectralPitches(frame, bassOnly = false) {
  return new Set((frame.spectralPeaks || []).filter((peak) => peak.magnitude > 0 && (!bassOnly || peak.midi < 60))
    .slice(0, 10).map((peak) => Math.round(peak.midi)));
}

function frameBassAnchor(frame) {
  const bass = (frame.spectralPeaks || []).filter((peak) => peak.midi < 60 && peak.magnitude > 0);
  const maximum = Math.max(0, ...bass.map((peak) => peak.magnitude));
  const candidates = bass.filter((peak) => peak.magnitude >= maximum * 0.2);
  return candidates.length ? ((Math.round(Math.min(...candidates.map((peak) => peak.midi)) % 12) + 12) % 12) : null;
}

function dominantBassAnchor(frames) {
  const counts = new Map();
  frames.map(frameBassAnchor).filter((pitch) => pitch !== null)
    .forEach((pitch) => counts.set(pitch, (counts.get(pitch) || 0) + 1));
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function mergeShortRuns(runs, minimumFrames) {
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let index = 0; index < runs.length; index++) {
      const run = runs[index];
      if (run.isSilence) continue;
      if (run.end - run.start >= minimumFrames) continue;
      const previous = runs[index - 1]?.isSilence ? null : runs[index - 1];
      const next = runs[index + 1]?.isSilence ? null : runs[index + 1];
      if (!previous && !next) continue;
      let target;
      if (!previous) target = next;
      else if (!next) target = previous;
      else if (previous.symbol === next.symbol) target = previous;
      else target = previous.weight >= next.weight ? previous : next;
      target.start = Math.min(target.start, run.start);
      target.end = Math.max(target.end, run.end);
      target.weight += run.weight;
      runs.splice(index, 1);
      changed = true;
      break;
    }
  }
  return runs;
}

/** Build stable chord regions independently of the beat grid. */
export function buildHarmonicRegions(frames, durationMs, bpm, options = {}) {
  if (!Array.isArray(frames) || !frames.length) return [];
  const config = { ...DEFAULTS, ...options };
  const spacingMs = frames.length > 1
    ? Math.max(1, (frames.at(-1).timeSec - frames[0].timeSec) * 1000 / (frames.length - 1)) : 46;
  const silence = detectSilenceFrames(frames, {
    minSilenceMs: config.minSilenceMs,
    spacingMs,
    thresholdRms: config.silenceThresholdRms,
    absoluteRmsFloor: config.absoluteRmsFloor,
    relativeRmsFloor: config.relativeRmsFloor,
  });
  const silenceMask = silence.mask;
  const analysisFrames = frames.map((frame, index) => silenceMask[index]
    ? { ...frame, isSilence: true, chroma: Array(12).fill(0), spectralPeaks: [] }
    : { ...frame, isSilence: false });
  const smoothFrames = Math.max(config.minSmoothingFrames, Math.round(config.smoothingMs / spacingMs));
  const minDurationMs = Math.max(config.minRegionMs, Number.isFinite(bpm) && bpm > 0 ? 60_000 / bpm * 0.35 : 0);
  const minFrames = Math.max(config.minRunFrames, Math.ceil(minDurationMs / spacingMs));
  const confirmFrames = Math.max(config.minChangeFrames, Math.ceil(config.changeConfirmMs / spacingMs));
  let lastSilenceIndex = -1;
  const evaluated = analysisFrames.map((frame, index) => {
    if (silenceMask[index]) lastSilenceIndex = index;
    if (silenceMask[index]) return { timeSec: frame.timeSec, chroma: Array(12).fill(0),
      guess: { symbol: null, score: 0, margin: 0, accepted: false, alternatives: [] },
      symbol: null, accepted: false, isSilence: true };
    const start = Math.max(index - smoothFrames + 1, lastSilenceIndex + 1, 0);
    const window = analysisFrames.slice(start, index + 1);
    const chroma = Array.from({ length: 12 }, (_, pitch) =>
      window.reduce((sum, item) => sum + (item.chroma?.[pitch] || 0), 0) / window.length);
    const guess = matchChordTemplate(chroma, { minScore: config.minScore, minMargin: config.minMargin });
    const closeProposal = guess.score >= config.minScore * 0.85 && guess.supportedTones >= 2;
    return { timeSec: frame.timeSec, chroma, guess, symbol: closeProposal ? guess.symbol : null,
      accepted: Boolean(guess.accepted), isSilence: false };
  });

  // Detect sustained changes in the complete harmonic fingerprint. Beat bins
  // remain useful for melody tracing, but chord boundaries follow audio change.
  const meanChroma = (start, end) => Array.from({ length: 12 }, (_, pitch) => {
    let total = 0;
    for (let index = start; index < end; index++) total += evaluated[index].chroma[pitch];
    return total / Math.max(1, end - start);
  });
  const starts = [{ index: 0, evidence: null }];
  // Compare two adjacent harmonic windows, then confirm the new fingerprint
  // against a following window. The previous implementation compared every
  // candidate with the first 200 ms of the song and also required near-identical
  // peak sets, so real chord changes in a dense mix were almost always ignored.
  const comparisonFrames = Math.max(confirmFrames, Math.ceil(400 / spacingMs));
  const tailFramesCount = comparisonFrames;
  for (let index = comparisonFrames; index + comparisonFrames * 2 < frames.length; index++) {
    const before = meanChroma(index - comparisonFrames, index);
    const after = meanChroma(index, index + comparisonFrames);
    const beforeNorm = normalizedMass(before), afterNorm = normalizedMass(after);
    const differences = beforeNorm.map((value, pitch) => Math.abs(value - afterNorm[pitch]));
    const changedPitchClasses = differences.filter((difference) => difference >= 0.055).length;
    const chromaDistance = profileDistance(before, after);
    const beforeGuess = matchChordTemplate(before, { minScore: config.minScore, minMargin: config.minMargin });
    const afterGuess = matchChordTemplate(after, { minScore: config.minScore, minMargin: config.minMargin });
    const beforeFrames = analysisFrames.slice(index - comparisonFrames, index);
    const afterFrames = analysisFrames.slice(index, index + comparisonFrames);
    const tailFrames = analysisFrames.slice(index + comparisonFrames, index + comparisonFrames + tailFramesCount);
    if ([...beforeFrames, ...afterFrames, ...tailFrames].some((frame) => frame.isSilence)) continue;
    const beforeClasses = new Set(beforeFrames.flatMap((frame) => [...frameSpectralPitches(frame)]));
    const afterClasses = new Set(afterFrames.flatMap((frame) => [...frameSpectralPitches(frame)]));
    const changedSpectralPitches = [...beforeClasses].filter((pitch) => !afterClasses.has(pitch)).length
      + [...afterClasses].filter((pitch) => !beforeClasses.has(pitch)).length;
    const tailChroma = meanChroma(index + comparisonFrames, index + comparisonFrames + tailFramesCount);
    const tailDistance = profileDistance(after, tailChroma);
    // Spectral peaks naturally move with melody, vibrato and transients. Keep
    // them as evidence, but let the smoothed pitch-class fingerprint confirm
    // a chord change without demanding an identical FFT peak set.
    const sustainedAfter = tailDistance < 0.2;
    const beforeBass = dominantBassAnchor(beforeFrames);
    const afterBass = dominantBassAnchor(afterFrames);
    const bassChanged = beforeBass !== null && afterBass !== null && beforeBass !== afterBass;
    const chordChanged = beforeGuess.accepted && afterGuess.accepted
      && beforeGuess.symbol !== afterGuess.symbol
      && changedPitchClasses >= 2;
    const constellationChanged = chromaDistance >= 0.35 && changedPitchClasses >= 5;
    const inversionOrVoicingChanged = bassChanged && (changedSpectralPitches >= 2 || chromaDistance >= 0.08);
    if (!sustainedAfter || (!chordChanged && !constellationChanged && !inversionOrVoicingChanged)) continue;
    starts.push({ index, evidence: { changedPitchClasses, changedSpectralPitches, bassChanged,
      boundaryStrength: Math.min(1, changedPitchClasses / 4 + changedSpectralPitches / 10 + (bassChanged ? 0.35 : 0)) } });
    index += Math.max(confirmFrames, Math.floor(minFrames * 0.65)) - 1;
  }

  // Silence has its own boundaries and survives minimum chord-duration
  // smoothing, so neither adjacent chord can leak into a quiet passage.
  for (let index = 1; index < silenceMask.length; index++) {
    if (silenceMask[index] !== silenceMask[index - 1]) {
      starts.push({ index, evidence: { type: 'silence-boundary', isSilence: silenceMask[index],
        silenceThresholdRms: silence.thresholdRms } });
    }
  }

  const startsByIndex = new Map();
  for (const item of starts) {
    const previous = startsByIndex.get(item.index);
    if (!previous || item.evidence?.type === 'silence-boundary') startsByIndex.set(item.index, item);
  }
  const uniqueStarts = [...startsByIndex.values()].sort((left, right) => left.index - right.index);
  const boundaries = [...uniqueStarts, { index: frames.length, evidence: null }];
  const runs = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1].index;
    const chroma = meanChroma(start.index, end);
    const isSilence = Boolean(silenceMask[start.index]);
    const guess = isSilence
      ? { symbol: null, score: 0, accepted: false }
      : matchChordTemplate(chroma, { minScore: config.minScore, minMargin: config.minMargin });
    const closeProposal = !isSilence && guess.score >= config.minScore * 0.85 && guess.supportedTones >= 2;
    return { symbol: closeProposal ? guess.symbol : null, accepted: Boolean(guess.accepted), isSilence,
      start: start.index, end, weight: guess.score * (end - start.index), boundary: start.evidence };
  });
  mergeShortRuns(runs, minFrames);

  // A moving melody can perturb the spectrum while the chord remains stable.
  // Keep the new boundary only when the smoothed pitch-class fingerprint also
  // changes; an explicit bass inversion remains a meaningful distinction.
  for (let index = 1; index < runs.length;) {
    const previous = runs[index - 1];
    const current = runs[index];
    const sameHarmony = previous.symbol === current.symbol && previous.isSilence === current.isSilence;
    const profileChange = profileDistance(meanChroma(previous.start, previous.end), meanChroma(current.start, current.end));
    const stableChordLabel = sameHarmony && previous.symbol !== null;
    if (sameHarmony && !current.boundary?.bassChanged && (stableChordLabel || profileChange < 0.22)) {
      previous.end = current.end;
      previous.weight += current.weight;
      runs.splice(index, 1);
      continue;
    }
    index++;
  }

  const regions = [];
  for (const run of runs) {
    const startFrame = analysisFrames[run.start];
    const endFrame = analysisFrames[Math.min(frames.length - 1, run.end - 1)];
    const startMs = run.start === 0 ? 0 : Math.round((frames[run.start - 1].timeSec + startFrame.timeSec) * 500);
    const endMs = run.end >= frames.length ? durationMs
      : Math.max(startMs + 1, Math.round((endFrame.timeSec + frames[run.end].timeSec) * 500));
    const sourceFrames = analysisFrames.slice(run.start, run.end);
    const chroma = Array.from({ length: 12 }, (_, pitch) =>
      sourceFrames.reduce((sum, frame) => sum + (frame.chroma?.[pitch] || 0), 0) / Math.max(1, sourceFrames.length));
    const normalizedChroma = normalized(chroma);
    const isSilence = Boolean(run.isSilence);
    const guess = isSilence
      ? { symbol: null, score: 0, margin: 0, accepted: false, alternatives: [] }
      : matchChordTemplate(chroma, { minScore: config.minScore, minMargin: config.minMargin });
    const peaksByMidi = new Map();
    for (const frame of sourceFrames) for (const peak of frame.spectralPeaks || []) {
      const key = Math.round(peak.midi);
      const item = peaksByMidi.get(key) || { ...peak, midi: key, magnitude: 0, samples: 0 };
      item.magnitude += peak.magnitude || 0;
      item.samples++;
      peaksByMidi.set(key, item);
    }
    const peaks = [...peaksByMidi.values()].map((peak) => ({ ...peak, magnitude: peak.magnitude / peak.samples }))
      .sort((a, b) => b.magnitude - a.magnitude);
    const maxMagnitude = peaks[0]?.magnitude || 1;
    const spectralPeaks = peaks.map((peak) => ({ ...peak, strength: peak.magnitude / maxMagnitude }));
    const priorFrames = analysisFrames.filter((frame) => frame.timeSec * 1000 >= startMs - 350 && frame.timeSec * 1000 < startMs);
    const before = Array.from({ length: 12 }, (_, pitch) => priorFrames.length
      ? priorFrames.reduce((sum, frame) => sum + (frame.chroma?.[pitch] || 0), 0) / priorFrames.length : 0);
    const beforeNorm = normalized(before);
    const changedPitchClasses = beforeNorm.reduce((count, value, pitch) =>
      count + (Math.abs(value - normalizedChroma[pitch]) >= 0.18 ? 1 : 0), 0);
    const priorBass = dominantBassAnchor(priorFrames);
    const currentBass = dominantBassAnchor(sourceFrames);
    const bassChanged = priorBass !== null && currentBass !== null && priorBass !== currentBass;
    const priorPeakClasses = new Set(priorFrames.flatMap(frame => [...frameSpectralPitches(frame)]));
    const currentPeakClasses = new Set(sourceFrames.flatMap(frame => [...frameSpectralPitches(frame)]));
    const changedSpectralPitches = [...priorPeakClasses].filter((pitch) => !currentPeakClasses.has(pitch)).length
      + [...currentPeakClasses].filter((pitch) => !priorPeakClasses.has(pitch)).length;
    // Keep the label used to build the stable run. Reclassifying the displayed
    // time slice can pull one transient frame across a rounded boundary and
    // erase an otherwise confirmed chord (for example C -> Cmaj7 for one FFT).
    regions.push({ id: `harmonic-${regions.length + 1}`, startMs, endMs,
      symbol: isSilence ? null : run.symbol, confidence: isSilence ? 0 : guess.score, margin: isSilence ? 0 : guess.margin,
      accepted: isSilence ? false : Boolean(run.accepted), selectedSymbol: '', isSilence,
      state: isSilence ? 'silence' : 'harmony', silenceThresholdRms: isSilence ? silence.thresholdRms : null,
      alternatives: guess.alternatives || [], chroma: isSilence ? Array(12).fill(0) : normalizedChroma,
      spectralPeaks: spectralPeaks.slice(0, 32), bassPeaks: spectralPeaks.filter((peak) => peak.midi < 60).slice(0, 8),
      highPeaks: spectralPeaks.filter((peak) => peak.midi >= 60).slice(0, 8),
      stabilityMs: endMs - startMs, evidence: isSilence
        ? { type: 'silence', method: 'RMS energy gate', silenceThresholdRms: silence.thresholdRms,
          frames: sourceFrames.length }
        : run.boundary || { changedPitchClasses, changedSpectralPitches, bassChanged,
          boundaryStrength: Math.min(1, changedPitchClasses / 4 + changedSpectralPitches / 10 + (bassChanged ? 0.35 : 0)) } });
  }
  if (regions.length) {
    regions[0].startMs = 0;
    regions.at(-1).endMs = durationMs;
  }
  return regions;
}
