/** Resize an audio clip from one edge while keeping the source and timeline aligned. */
export function resizeAudioClip(clip, edge, deltaMs, { minDurationMs = 100, sourceDurationMs = Infinity } = {}) {
  const next = { ...clip };
  const start = Math.max(0, Number(clip.startMs) || 0);
  const duration = Math.max(minDurationMs, Number(clip.durationMs) || minDurationMs);
  const sourceStart = Math.max(0, Number(clip.sourceStartMs) || 0);
  const captureRate = Math.max(.25, Math.min(4, Number(clip.captureRate) || 1));
  const delta = Number(deltaMs) || 0;

  if (edge === 'left') {
    const applied = Math.max(-start, Math.max(-sourceStart / captureRate, Math.min(duration - minDurationMs, delta)));
    next.startMs = start + applied;
    next.sourceStartMs = sourceStart + applied * captureRate;
    next.durationMs = duration - applied;
    return next;
  }

  const maxDuration = Number.isFinite(sourceDurationMs)
    ? Math.max(minDurationMs, (sourceDurationMs - sourceStart) / captureRate)
    : Infinity;
  next.durationMs = Math.max(minDurationMs, Math.min(maxDuration, duration + delta));
  return next;
}

/** Encode a rendered Web Audio buffer as a downloadable 16-bit PCM WAV. */
export function audioBufferToWav(buffer) {
  const channels = Math.max(1, Number(buffer.numberOfChannels) || 1);
  const frames = Number(buffer.length) || 0;
  const sampleRate = Number(buffer.sampleRate) || 44100;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(bytes);
  const writeText = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, dataBytes, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, Number(channelData[channel]?.[frame]) || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
