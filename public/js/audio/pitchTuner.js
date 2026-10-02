const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const REGISTERS = ['bass', 'middle', 'high'];

function eventAt(events, timeMs) {
  let low = 0, high = events.length - 1, best = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (events[middle].startMs <= timeMs) { best = middle; low = middle + 1; }
    else high = middle - 1;
  }
  const event = best >= 0 ? events[best] : null;
  return event?.endMs > timeMs ? event : null;
}

function frameNear(frames, timeMs, toleranceMs = 160) {
  let low = 0, high = frames.length - 1, before = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle].timeMs <= timeMs) { before = middle; low = middle + 1; }
    else high = middle - 1;
  }
  const candidates = [before, before + 1].filter((index) => index >= 0 && index < frames.length)
    .sort((left, right) => Math.abs(frames[left].timeMs - timeMs) - Math.abs(frames[right].timeMs - timeMs));
  const index = candidates[0];
  return index !== undefined && Math.abs(frames[index].timeMs - timeMs) <= toleranceMs ? frames[index] : null;
}

/** Read the smoothed note event under the audio cursor, optionally locked to one register. */
export function pitchReadingAt({ tracks, frames = [], timeMs, register = 'auto', silence = false }) {
  if (silence || !Number.isFinite(timeMs) || timeMs < 0) return { kind: 'silence' };
  const registers = register === 'auto' ? REGISTERS : REGISTERS.includes(register) ? [register] : REGISTERS;
  const events = registers.map((name) => {
    const event = eventAt(tracks?.[name] || [], timeMs);
    return event ? { ...event, register: event.register || name } : null;
  }).filter((event) => Number.isInteger(event?.midi));
  if (!events.length) return null;
  const reading = events.sort((left, right) => (right.strength || 0) - (left.strength || 0)
    || REGISTERS.indexOf(left.register) - REGISTERS.indexOf(right.register))[0];
  const frame = frameNear(frames, timeMs);
  if (frame?.isSilence) return { kind: 'silence' };
  const peak = (frame?.peaks || []).filter((item) => Math.round(item.midi) === reading.midi)
    .sort((left, right) => (right.strength || 0) - (left.strength || 0))[0];
  const frequencyHz = Number(peak?.frequencyHz);
  const equalTemperedHz = 440 * 2 ** ((reading.midi - 69) / 12);
  const cents = Number.isFinite(frequencyHz) && frequencyHz > 0
    ? 1200 * Math.log2(frequencyHz / equalTemperedHz) : 0;
  return {
    kind: 'note', midi: reading.midi,
    note: `${NOTE_NAMES[((reading.midi % 12) + 12) % 12]}${Math.floor(reading.midi / 12) - 1}`,
    register: reading.register,
    strength: Number(reading.strength) || 0,
    frequencyHz: Number.isFinite(frequencyHz) && frequencyHz > 0 ? frequencyHz : equalTemperedHz,
    cents,
  };
}
