/** Split the track at rhythmic beats, then omit the short attack before reading harmony. */
export function buildPostBeatWindows(frames, beatSeconds, durationMs, { settleMs = 90, minimumFrames = 2 } = {}) {
  const beats = [...new Set((beatSeconds || []).filter(Number.isFinite).map((time) => Math.max(0, time * 1000)))]
    .sort((left, right) => left - right);
  if (!beats.length || beats[0] > 80) beats.unshift(0);
  const windows = [];
  for (let index = 0; index < beats.length; index++) {
    const startMs = beats[index];
    const endMs = Math.min(durationMs, beats[index + 1] ?? durationMs);
    if (endMs <= startMs) continue;
    const transientMs = Math.min(settleMs, (endMs - startMs) * 0.22);
    const analysisStartMs = Math.min(endMs, startMs + transientMs);
    let selected = (frames || []).filter((frame) => frame.timeSec * 1000 >= analysisStartMs
      && frame.timeSec * 1000 < endMs);
    // At fast tempos a transient-free window can be too short. Prefer a smaller
    // attack exclusion before falling back to the whole beat.
    if (selected.length < minimumFrames) {
      const relaxedStart = startMs + Math.min(35, transientMs / 2);
      selected = (frames || []).filter((frame) => frame.timeSec * 1000 >= relaxedStart
        && frame.timeSec * 1000 < endMs);
    }
    if (selected.length < minimumFrames) {
      selected = (frames || []).filter((frame) => frame.timeSec * 1000 >= startMs
        && frame.timeSec * 1000 < endMs);
    }
    if (!selected.length) continue;
    windows.push({ index, startMs: Math.round(startMs), endMs: Math.round(endMs),
      analysisStartMs: Math.round(selected[0].timeSec * 1000), transientSkippedMs: Math.max(0, Math.round(selected[0].timeSec * 1000 - startMs)), frames: selected });
  }
  return windows;
}
