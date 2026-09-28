/** Hysteresis for a microphone pitch estimate: reject weak frames, confirm changes, and briefly hold notes. */
export function createLivePitchTracker({ minConfidence = 0.2, confirmMs = 280, releaseMs = 350, frequencyAlpha = 0.22 } = {}) {
  let current = null;
  let pendingMidi = null;
  let pendingSince = null;
  let lastValidAt = null;

  function update(frequencyHz, confidence, timestampMs = performance.now()) {
    const valid = Number.isFinite(frequencyHz) && frequencyHz >= 40 && frequencyHz <= 1600
      && Number.isFinite(confidence) && confidence >= minConfidence;
    if (!valid) {
      pendingMidi = null; pendingSince = null;
      if (lastValidAt === null || timestampMs - lastValidAt > releaseMs) current = null;
      return { current: current ? { ...current } : null, candidate: null, pendingMs: 0 };
    }
    lastValidAt = timestampMs;
    const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
    if (current?.midi === midi) {
      current.frequencyHz = current.frequencyHz * (1 - frequencyAlpha) + frequencyHz * frequencyAlpha;
      current.confidence = confidence;
      pendingMidi = null; pendingSince = null;
    } else {
      if (pendingMidi !== midi) { pendingMidi = midi; pendingSince = timestampMs; }
      if (timestampMs - pendingSince >= confirmMs) {
        current = { midi, frequencyHz, confidence };
        pendingMidi = null; pendingSince = null;
      }
    }
    return {
      current: current ? { ...current } : null,
      candidate: pendingMidi,
      pendingMs: pendingSince === null ? 0 : Math.max(0, timestampMs - pendingSince),
    };
  }

  function reset() { current = null; pendingMidi = null; pendingSince = null; lastValidAt = null; }
  return { update, reset };
}
