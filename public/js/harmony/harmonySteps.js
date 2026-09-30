import { buildBeatGrid } from '../audio/beatGrid.js';

// Beat-synchronous analysis steps. Chords change on beats in almost all
// popular music, so harmony is read once per beat (or half beat when beats
// are slow enough to hide anticipations) instead of per FFT frame.

const MIN_STEP_MS = 120;

function beatCoverage(beatsSec, durationMs) {
  const clean = (beatsSec || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length < 2 || !durationMs) return 0;
  return ((clean.at(-1) - clean[0]) * 1000) / durationMs;
}

/**
 * @returns {{kind:'beats'|'fixed', stepsPerBeat:number, beatsPerBar:number, beatMs:number,
 *   steps:Array<{startMs:number,endMs:number,weight:number,beatIndex:number}>}}
 *   weight = step length in beats (1 or 0.5), used to scale evidence and costs.
 */
export function buildAnalysisGrid({ beatsSec, bpm, rhythmConfidence = Infinity, durationMs, beatsPerBar = 4,
  subdivision = 'auto', fixedStepMs = 250 }) {
  const reliable = rhythmConfidence >= 1.2 && beatCoverage(beatsSec, durationMs) >= 0.6;
  const beatMsFromBpm = Number.isFinite(bpm) && bpm > 0 ? 60000 / bpm : 500;
  if (!reliable) {
    const steps = [];
    for (let startMs = 0, index = 0; startMs < durationMs; startMs += fixedStepMs, index++) {
      steps.push({ startMs, endMs: Math.min(durationMs, startMs + fixedStepMs), weight: fixedStepMs / beatMsFromBpm, beatIndex: index });
    }
    return { kind: 'fixed', stepsPerBeat: beatMsFromBpm / fixedStepMs, beatsPerBar, beatMs: beatMsFromBpm, steps };
  }
  const boundaries = buildBeatGrid(beatsSec, durationMs, bpm).map((sec) => Math.round(sec * 1000));
  const intervals = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const startMs = boundaries[index], endMs = boundaries[index + 1];
    if (endMs - startMs < MIN_STEP_MS && intervals.length) intervals.at(-1).endMs = endMs;
    else if (endMs > startMs) intervals.push({ startMs, endMs });
  }
  if (intervals.length > 1 && intervals[0].endMs - intervals[0].startMs < MIN_STEP_MS) {
    intervals[1].startMs = intervals[0].startMs;
    intervals.shift();
  }
  const lengths = intervals.map((interval) => interval.endMs - interval.startMs).sort((a, b) => a - b);
  const beatMs = lengths[Math.floor(lengths.length / 2)] || beatMsFromBpm;
  const split = subdivision === 'half' || (subdivision === 'auto' && beatMs >= 450);
  const steps = [];
  intervals.forEach((interval, beatIndex) => {
    if (split && interval.endMs - interval.startMs >= 2 * MIN_STEP_MS) {
      const middle = Math.round((interval.startMs + interval.endMs) / 2);
      steps.push({ startMs: interval.startMs, endMs: middle, weight: 0.5, beatIndex });
      steps.push({ startMs: middle, endMs: interval.endMs, weight: 0.5, beatIndex });
    } else {
      steps.push({ ...interval, weight: 1, beatIndex });
    }
  });
  return { kind: 'beats', stepsPerBeat: split ? 2 : 1, beatsPerBar, beatMs, steps };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Per-bin median of the frames inside each step, skipping the attack at the
 * start and the release at the end (where the next chord may already bleed in).
 * @param {{hopMs:number,count:number,treble:Float32Array,bass:Float32Array}} frames frame i is centred at i·hopMs
 * @param {boolean[]|Uint8Array} [silenceMask]
 */
export function aggregateSteps(frames, grid, { settleMs = 90, tailMs = 60, silenceMask = null } = {}) {
  const { hopMs, count } = frames;
  return grid.steps.map((step) => {
    const length = step.endMs - step.startMs;
    const pick = (from, to) => {
      const first = Math.max(0, Math.ceil(from / hopMs));
      const last = Math.min(count - 1, Math.ceil(to / hopMs) - 1);
      return first <= last ? Array.from({ length: last - first + 1 }, (_, offset) => first + offset) : [];
    };
    let indices = pick(step.startMs + Math.min(settleMs, 0.2 * length), step.endMs - Math.min(tailMs, 0.15 * length));
    if (!indices.length) indices = pick(step.startMs, step.endMs);
    if (!indices.length) indices = [Math.min(count - 1, Math.max(0, Math.round((step.startMs + step.endMs) / 2 / hopMs)))];
    const treble = new Float64Array(12), bass = new Float64Array(12);
    for (let pc = 0; pc < 12; pc++) {
      treble[pc] = median(indices.map((index) => frames.treble[index * 12 + pc]));
      bass[pc] = median(indices.map((index) => frames.bass[index * 12 + pc]));
    }
    const silent = silenceMask ? indices.filter((index) => silenceMask[index]).length : 0;
    return { ...step, treble, bass, frameCount: indices.length, silentFraction: silent / indices.length,
      trebleEnergy: treble.reduce((sum, value) => sum + value, 0), bassEnergy: bass.reduce((sum, value) => sum + value, 0) };
  });
}
