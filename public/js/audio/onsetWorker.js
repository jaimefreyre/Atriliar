// Light-weight onset and input-quality estimate; this does not try to
// identify an instrument or an accurate individual note.
let noiseFloor = 0.004;
let previousRms = 0;
let lastOnsetMs = -Infinity;
let clippingSamples = 0;

self.onmessage = ({ data }) => {
  if (data.type === 'reset') {
    noiseFloor = 0.004; previousRms = 0; lastOnsetMs = -Infinity; clippingSamples = 0;
    self.postMessage({ type: 'reset' });
    return;
  }
  if (data.type !== 'frame') return;

  const { samples, sampleRate, currentFrame } = data;
  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    const abs = Math.abs(value);
    sumSquares += value * value;
    if (abs > peak) peak = abs;
    if (abs >= 0.995) clipped++;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  const clipRatio = clipped / Math.max(1, samples.length);
  const timestampMs = (currentFrame + samples.length) / sampleRate * 1000;
  const rising = rms >= Math.max(0.018, noiseFloor * 2.4) && rms >= Math.max(0.009, previousRms * 1.75);
  const onset = rising && timestampMs - lastOnsetMs >= 120;
  if (onset) lastOnsetMs = timestampMs;
  else if (rms < Math.max(0.012, noiseFloor * 2.0)) noiseFloor = noiseFloor * 0.97 + rms * 0.03;
  previousRms = rms;
  clippingSamples += clipped;

  const quality = clipRatio > 0.01 ? 'clipping' : rms < 0.006 ? 'low' : 'ok';
  self.postMessage({ type: 'frame', onset, timestampMs, rms, peak, clipRatio, quality });
};
