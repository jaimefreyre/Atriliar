// The clock chain for live input. A worklet frame is stamped on the
// AudioContext timeline, the UI runs on performance.now() and the song on the
// media element. Converting through here (and subtracting the input latency)
// lines up what the microphone heard with the moment of the song it answers.

/** AudioContext time of a frame → performance.now() time of the sound that produced it. */
export function contextToPerfMs(contextMs, { contextNowMs, perfNowMs, inputLatencyMs = 0 }) {
  if (!Number.isFinite(contextMs) || !Number.isFinite(contextNowMs) || !Number.isFinite(perfNowMs)) return null;
  return perfNowMs - Math.max(0, contextNowMs - contextMs) - Math.max(0, Number(inputLatencyMs) || 0);
}

/** Song position at a past performance.now() instant, from the current position and playback rate. */
export function mediaPositionAt(perfMs, { positionMs, perfNowMs, playing = true, playbackRate = 1 }) {
  if (!Number.isFinite(perfMs) || !playing) return positionMs;
  return Math.max(0, positionMs - Math.max(0, perfNowMs - perfMs) * (playbackRate > 0 ? playbackRate : 1));
}

/**
 * Input latency of a capture track in ms: what the browser reports
 * (settings.latency, in seconds) or 0 when it doesn't say — a wrong guess
 * would be worse than none.
 */
export function inputLatencyMsFor(track) {
  const latency = track?.getSettings?.()?.latency;
  return Number.isFinite(latency) && latency > 0 ? latency * 1000 : 0;
}
