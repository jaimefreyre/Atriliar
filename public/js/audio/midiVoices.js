const REGISTER_RANGES = Object.freeze({
  bass: [28, 47],
  middle: [48, 71],
  high: [72, 96],
});

export function midiRegisterFor(midi) {
  if (midi < REGISTER_RANGES.middle[0]) return 'bass';
  if (midi < REGISTER_RANGES.high[0]) return 'middle';
  return 'high';
}

/** Turn sparse FFT snapshots into readable, time-aligned note events. */
export function extractMidiVoices(frames, { startMs = 0, endMs = Infinity, manualNotes = [], bridgeGapMs = 145,
  waveform = [], durationMs = endMs } = {}) {
  const grouped = { bass: [], middle: [], high: [] };
  const orderedFrames = [...(frames || [])].filter((frame) => Number.isFinite(frame.timeMs))
    .sort((left, right) => left.timeMs - right.timeMs);
  const framesInRange = orderedFrames.filter((frame) => frame.timeMs >= startMs && frame.timeMs < endMs);
  const levelAt = (timeMs) => {
    if (!waveform.length || !(durationMs > 0)) return 1;
    const position = Math.max(0, Math.min(waveform.length - 1, Math.floor(timeMs / durationMs * waveform.length)));
    const first = Math.max(0, position - 1), last = Math.min(waveform.length - 1, position + 1);
    let sum = 0;
    for (let index = first; index <= last; index++) sum += Number(waveform[index]) || 0;
    return Math.max(0, Math.min(1, sum / (last - first + 1)));
  };
  for (const [register, [minimum, maximum]] of Object.entries(REGISTER_RANGES)) {
    const samples = framesInRange.map((frame, index) => {
      const nextTime = framesInRange[index + 1]?.timeMs ?? Math.min(endMs, frame.timeMs + 100);
      const peak = (frame.peaks || []).filter((item) => Number.isFinite(item.midi)
        && item.midi >= minimum && item.midi <= maximum && Number(item.strength) >= 0.08)
        .sort((left, right) => (right.strength || 0) - (left.strength || 0))[0];
      const level = Number.isFinite(frame.level) ? Math.max(0, Math.min(1, frame.level)) : levelAt(frame.timeMs);
      return {
        startMs: frame.timeMs,
        endMs: Math.min(endMs, Math.max(frame.timeMs + 80, nextTime)),
        midi: peak ? Math.round(peak.midi) : null, strength: peak ? Number(peak.strength) || 0 : 0,
        level, levels: [{ timeMs: frame.timeMs, level }],
        source: 'audio', register,
      };
    });

    // A single FFT frame can be stolen by a drum transient or a stronger
    // harmonic. Replace isolated one-frame excursions with the pitch that
    // persists on both sides, and bridge a single missing snapshot.
    for (let index = 1; index < samples.length - 1; index++) {
      const previous = samples[index - 1], current = samples[index], next = samples[index + 1];
      if (previous && next && previous.midi === next.midi
        && (!current || current.midi !== previous.midi)
        && (!current || current.strength < Math.max(previous.strength, next.strength) * 1.7)) {
        samples[index] = { ...previous, ...current, midi: previous.midi,
          strength: Math.max(previous.strength, next.strength),
          level: current?.level ?? (previous.level + next.level) / 2,
          levels: current?.levels || [{ timeMs: current?.startMs ?? (previous.endMs + next.startMs) / 2,
            level: (previous.level + next.level) / 2 }] };
      }
    }

    for (const sample of samples) {
      if (!Number.isInteger(sample?.midi)) continue;
      const prior = grouped[register].at(-1);
      if (prior && prior.midi === sample.midi && sample.startMs - prior.endMs <= bridgeGapMs) {
        const priorDuration = Math.max(1, prior.endMs - prior.startMs);
        const sampleDuration = Math.max(1, sample.endMs - sample.startMs);
        prior.endMs = sample.endMs;
        prior.strength = Math.max(prior.strength, sample.strength);
        prior.level = (prior.level * priorDuration + sample.level * sampleDuration) / (priorDuration + sampleDuration);
        prior.levels.push(...sample.levels);
      } else grouped[register].push(sample);
    }
  }
  for (const manual of manualNotes || []) {
    if (!Number.isFinite(manual.timeMs) || !Number.isInteger(manual.midi)
      || manual.timeMs < startMs || manual.timeMs >= endMs) continue;
    const register = midiRegisterFor(manual.midi);
    grouped[register] = grouped[register].filter((note) => Math.abs(note.startMs - manual.timeMs) > 100);
    grouped[register].push({ ...manual, startMs: manual.timeMs, endMs: Math.min(endMs, manual.timeMs + (manual.durationMs || 360)),
      strength: 1, source: 'manual', register });
  }
  Object.values(grouped).forEach((notes) => notes.sort((left, right) => left.startMs - right.startMs));
  return grouped;
}

/** Assemble playback from the whole timeline or a chosen voice without tying it to harmonic regions. */
export function selectMidiPlaybackEvents(tracks, { startMs = 0, endMs = Infinity, register = 'middle', mode = 'all' } = {}) {
  const registers = mode === 'all' ? ['bass', 'middle', 'high'] : [register];
  return registers.flatMap((voice) => tracks?.[voice] || [])
    .filter((event) => Number.isFinite(event.startMs) && Number.isFinite(event.endMs)
      && event.endMs > startMs && event.startMs < endMs)
    .map((event) => ({ ...event, startMs: Math.max(startMs, event.startMs), endMs: Math.min(endMs, event.endMs) }))
    .sort((left, right) => left.startMs - right.startMs || left.midi - right.midi);
}
