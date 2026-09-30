/** Return the single loop region currently being written by a continuous take. */
export function loopRecordingSlice({
  elapsedSongMs, recordStartMs, loopStartMs = 0, loopEndMs = 0, playbackRate = 1, loopEnabled = true,
}) {
  const elapsed = Math.max(0, Number(elapsedSongMs) || 0);
  const start = Math.max(0, Number(recordStartMs) || 0);
  const rate = Math.max(.25, Math.min(4, Number(playbackRate) || 1));
  const length = Math.max(0, Number(loopEndMs) - Number(loopStartMs));
  const looping = Boolean(loopEnabled && length > 0 && start < loopEndMs);
  if (!looping) return {
    startMs: start, sourceStartMs: 0, durationMs: Math.max(40, elapsed), captureRate: 1 / rate, lapNumber: 1,
  };

  const firstPassMs = Math.max(40, loopEndMs - start);
  if (elapsed <= firstPassMs) return {
    startMs: start, sourceStartMs: 0, durationMs: Math.max(40, elapsed), captureRate: 1 / rate, lapNumber: 1,
  };

  const afterFirstPass = elapsed - firstPassMs;
  let lapIndex = Math.floor(afterFirstPass / length);
  let durationMs = afterFirstPass % length;
  if (lapIndex > 0 && durationMs < 40) { lapIndex--; durationMs = length; }
  return {
    startMs: loopStartMs,
    sourceStartMs: (firstPassMs + lapIndex * length) / rate,
    durationMs: Math.max(40, durationMs),
    captureRate: 1 / rate,
    lapNumber: lapIndex + 2,
  };
}
