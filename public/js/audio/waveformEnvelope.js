/** Compact visual amplitude envelope; the audio itself remains in the local asset store. */
export function buildWaveformEnvelope(pcm, bins = 600) {
  if (!(pcm instanceof Float32Array) || !Number.isInteger(bins) || bins <= 0) return [];
  const count = Math.min(bins, pcm.length);
  if (!count) return [];
  const output = new Array(count);
  let largest = 0;
  for (let index = 0; index < count; index++) {
    const start = Math.floor(index * pcm.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * pcm.length / count));
    let peak = 0;
    for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(pcm[sample] || 0));
    output[index] = peak; largest = Math.max(largest, peak);
  }
  return largest ? output.map((peak) => peak / largest) : output;
}
