/** Create analysis boundaries from detected beats, repairing gaps and falling
 * back to a BPM grid when rhythm detection is absent or unusably sparse. */
export function buildBeatGrid(detectedBeatSeconds, durationMs, bpm) {
  const durationSec = Math.max(0, Number(durationMs) / 1000 || 0);
  if (!durationSec) return [0];
  const clean = [...new Set((Array.isArray(detectedBeatSeconds) ? detectedBeatSeconds : [])
    .map(Number).filter((time) => Number.isFinite(time) && time >= 0 && time < durationSec))]
    .sort((a, b) => a - b);
  const detectedPeriods = clean.slice(1).map((time, index) => time - clean[index])
    .filter((gap) => gap > 0.2 && gap < 2).sort((a, b) => a - b);
  const inferredPeriod = detectedPeriods.length ? detectedPeriods[Math.floor(detectedPeriods.length / 2)] : null;
  const period = Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 ? 60 / bpm
    : inferredPeriod || 0.5;
  const hasUsableBeats = clean.length >= 2 && clean.at(-1) - clean[0] >= Math.min(durationSec * 0.2, period * 2);
  const anchors = hasUsableBeats ? clean : [];
  const boundaries = [0];
  if (anchors.length) {
    for (const anchor of anchors) {
      const previous = boundaries.at(-1);
      if (anchor - previous > period * 1.65) {
        for (let fill = previous + period; fill < anchor - period * 0.35; fill += period) boundaries.push(fill);
      }
      if (anchor - boundaries.at(-1) > 0.04) boundaries.push(anchor);
    }
  } else {
    for (let time = period; time < durationSec; time += period) boundaries.push(time);
  }
  if (durationSec - boundaries.at(-1) > Math.max(period * 1.65, 1.2)) {
    for (let fill = boundaries.at(-1) + period; fill < durationSec - period * 0.35; fill += period) boundaries.push(fill);
  }
  if (durationSec - boundaries.at(-1) > 0.04) boundaries.push(durationSec);
  return boundaries.map((time) => Math.round(Math.max(0, Math.min(durationSec, time)) * 1000) / 1000);
}
