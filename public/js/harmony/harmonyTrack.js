import { computeHarmonyFrames, quantizeHarmonyFrames, dequantizeHarmonyFrames } from './chromaFrontEnd.js';
import { buildAnalysisGrid, aggregateSteps } from './harmonySteps.js';
import { estimateKey, diatonicPrior } from './keyProfile.js';
import { presetFor, computeFamilyEmissions, familySwitchCosts, familyMinSteps, decodeSegments, DEFAULT_SENSITIVITY, HARMONY_PRESETS } from './chordDecoder.js';
import { refineRegions } from './chordRefinement.js';
import { FAMILY_COUNT, familyForSymbol } from './chordVocabulary.js';
import { detectSilenceFrames } from '../audio/silenceGate.js';

// The single harmony track ("pista armónica") every view reads. User edits
// are stored as constraints, so changing the sensitivity re-decodes the
// automatic parts but never overwrites what the musician corrected.

export const HARMONY_VERSION = 6;
export const HARMONY_ENGINE = 'nnls-hmm-1';
export const SENSITIVITIES = Object.keys(HARMONY_PRESETS);

function silenceMaskFor(frames) {
  const list = Array.from({ length: frames.count }, (_, index) => ({ timeSec: (index * frames.hopMs) / 1000, rms: frames.rms[index] }));
  return detectSilenceFrames(list, { spacingMs: frames.hopMs }).mask;
}

function stepIndexAt(steps, timeMs) {
  let best = 0, distance = Infinity;
  steps.forEach((step, index) => {
    const d = Math.abs(step.startMs - timeMs);
    if (d < distance) { distance = d; best = index; }
  });
  return best;
}

function constraintsToSteps(constraints, steps) {
  const T = steps.length;
  const allowed = new Array(T).fill(null);
  const freeChange = new Uint8Array(T), noChange = new Uint8Array(T), relaxed = new Uint8Array(T);
  for (const constraint of constraints) {
    if (constraint.type === 'label') {
      const family = familyForSymbol(constraint.symbol);
      if (family === null) continue;
      let first = -1, last = -1;
      steps.forEach((step, index) => {
        const middle = (step.startMs + step.endMs) / 2;
        if (middle < constraint.startMs || middle >= constraint.endMs) return;
        allowed[index] = new Set([family]);
        if (first < 0) first = index;
        last = index;
      });
      if (first >= 0) { relaxed[first] = 1; if (last + 1 < T) relaxed[last + 1] = 1; }
    } else if (constraint.type === 'boundary') {
      const index = stepIndexAt(steps, constraint.atMs);
      if (index > 0) freeChange[index] = 1;
    } else if (constraint.type === 'merge') {
      steps.forEach((step, index) => { if (step.startMs > constraint.startMs && step.startMs < constraint.endMs) noChange[index] = 1; });
    }
  }
  steps.forEach((step, index) => {
    if (step.silentFraction >= 0.65) { relaxed[index] = 1; if (index + 1 < T) relaxed[index + 1] = 1; }
  });
  return { allowed, freeChange, noChange, relaxed };
}

/**
 * Lay the musician's chord choices over the decoded regions (boundaries and
 * merges already shaped the decoding): split at each span's edges and let the
 * user's symbol win inside it.
 */
export function applyLabelConstraints(regions, constraints) {
  let result = regions.map((region) => ({ ...region, source: 'auto', confirmed: false, selectedSymbol: '' }));
  for (const constraint of constraints.filter((item) => item.type === 'label')) {
    const next = [];
    for (const region of result) {
      const overlapStart = Math.max(region.startMs, constraint.startMs);
      const overlapEnd = Math.min(region.endMs, constraint.endMs);
      if (overlapEnd <= overlapStart) { next.push(region); continue; }
      if (region.startMs < overlapStart) next.push({ ...region, endMs: overlapStart });
      const symbol = constraint.symbol || null;
      const edited = constraint.kind !== 'confirm';
      // selectedSymbol is "the chord the musician decided" (edited or confirmed);
      // source says which of the two it was.
      next.push({ ...region, startMs: overlapStart, endMs: overlapEnd, symbol,
        state: symbol ? 'harmony' : region.state === 'harmony' ? 'no-chord' : region.state,
        source: edited ? 'user' : region.source, confirmed: true, selectedSymbol: symbol || '' });
      if (overlapEnd < region.endMs) next.push({ ...region, startMs: overlapEnd });
    }
    result = next;
  }
  return result.map((region) => ({ ...region, id: `h-${region.startMs}` }));
}

function decodeFromSteps(steps, grid, { sensitivity, constraints, key, durationMs }) {
  const preset = presetFor(sensitivity);
  const { allowed, freeChange, noChange, relaxed } = constraintsToSteps(constraints, steps);
  const emissions = computeFamilyEmissions(steps, { preset, prior: diatonicPrior(key, preset.keyPrior), allowed });
  const lengths = steps.map((step) => step.endMs - step.startMs).sort((a, b) => a - b);
  const stepMs = lengths[lengths.length >> 1] || 500;
  const minSteps = familyMinSteps(preset, { stepsPerBeat: grid.stepsPerBeat, beatsPerBar: grid.beatsPerBar, stepMs });
  const decoded = decodeSegments({ emissions, T: steps.length, K: FAMILY_COUNT, minSteps, switchCost: familySwitchCosts(preset),
    relaxed, freeChange, noChange, withPosteriors: true });
  const regions = refineRegions({ ...decoded, steps, grid, preset, key, durationMs, forcedCuts: freeChange, noChange });
  return applyLabelConstraints(regions, constraints);
}

const stepsCache = new WeakMap();
/** The grid and aggregated steps behind a track (cached per stored frames). */
export function harmonyStepsFor(track) {
  return stepsFor(track);
}
function stepsFor(track) {
  if (stepsCache.has(track.frames)) return stepsCache.get(track.frames);
  const frames = dequantizeHarmonyFrames(track.frames);
  const grid = buildAnalysisGrid(track.grid);
  const steps = aggregateSteps(frames, grid, { silenceMask: silenceMaskFor(frames) });
  const entry = { grid, steps };
  stepsCache.set(track.frames, entry);
  return entry;
}

/**
 * @param {object} input
 * @param {Float32Array} [input.pcm] mono samples (or pass precomputed `frames`)
 * @param {object} [input.frames] output of computeHarmonyFrames
 * @param {number[]} input.beatsSec detected (or known) beat times
 */
export function buildHarmonyTrack({ pcm, sampleRate, frames: precomputed = null, beatsSec, bpm, rhythmConfidence = Infinity, durationMs,
  beatsPerBar = 4, sensitivity = DEFAULT_SENSITIVITY, constraints = [], source = { kind: 'mix' }, onProgress = null, shouldCancel = null }) {
  const frames = precomputed || computeHarmonyFrames(pcm, sampleRate, { onProgress, shouldCancel });
  const gridInput = { beatsSec: [...(beatsSec || [])], bpm, rhythmConfidence, durationMs, beatsPerBar };
  const grid = buildAnalysisGrid(gridInput);
  const steps = aggregateSteps(frames, grid, { silenceMask: silenceMaskFor(frames) });
  const key = estimateKey(steps);
  const stored = quantizeHarmonyFrames(frames);
  stepsCache.set(stored, { grid, steps });
  return {
    version: HARMONY_VERSION, engine: HARMONY_ENGINE,
    frontEnd: { kind: 'nnls-js', sampleRate: frames.sampleRate, frameSize: frames.frameSize, hopSize: frames.hopSize,
      tuningCents: Number(frames.tuning.cents.toFixed(1)), referenceHz: Number(frames.tuning.referenceHz.toFixed(2)) },
    source, frames: stored, grid: gridInput, gridKind: grid.kind, stepsPerBeat: grid.stepsPerBeat,
    key, sensitivity, constraints: [...constraints],
    regions: decodeFromSteps(steps, grid, { sensitivity, constraints, key, durationMs }),
  };
}

/** Re-decode from the stored frames (a sensitivity change takes milliseconds, no audio needed). */
export function redecodeHarmony(track, { sensitivity = track.sensitivity, constraints = track.constraints } = {}) {
  const { grid, steps } = stepsFor(track);
  return { ...track, sensitivity, constraints: [...constraints],
    regions: decodeFromSteps(steps, grid, { sensitivity, constraints, key: track.key, durationMs: track.grid.durationMs }) };
}

let constraintCounter = 0;
const newConstraintId = () => `hc-${Date.now().toString(36)}-${(constraintCounter++).toString(36)}`;
const stamp = (constraint) => ({ id: newConstraintId(), ...constraint, createdAt: new Date().toISOString() });

/**
 * Apply one user edit and return the new track. Every edit re-decodes from
 * the stored frames (tens of milliseconds): the regions stay the engine's
 * best answer given everything the musician decided, and removing a decision
 * never leaves a label that was only decoded to fit it.
 * - {type:'label', startMs, endMs, symbol}: choose a chord (null = no chord)
 * - {type:'confirm', startMs, endMs}: accept the automatic chord as it is
 * - {type:'clear', startMs, endMs}: forget every user decision in the span
 * - {type:'split', atMs}: a change may happen here, and the region is cut here
 * - {type:'merge', startMs, endMs}: one chord across the span
 */
export function applyUserEdit(track, edit) {
  const overlapsSpan = (item) => item.startMs < edit.endMs && item.endMs > edit.startMs;
  const insideSpan = (atMs) => atMs > edit.startMs && atMs < edit.endMs;
  let constraints;
  if (edit.type === 'label') {
    constraints = [...track.constraints.filter((item) => !(item.type === 'label' && overlapsSpan(item))),
      stamp({ type: 'label', kind: 'edit', startMs: edit.startMs, endMs: edit.endMs, symbol: edit.symbol ?? null })];
  } else if (edit.type === 'confirm') {
    // Confirm the engine's own answer: if an earlier decision covers the span,
    // decode without it first so its label isn't the one confirmed.
    const kept = track.constraints.filter((item) => !(item.type === 'label' && overlapsSpan(item)));
    const base = kept.length === track.constraints.length ? track : redecodeHarmony(track, { constraints: kept });
    const region = base.regions.find((item) => item.startMs <= edit.startMs && item.endMs > edit.startMs);
    const symbol = region?.state === 'harmony' ? region.symbol : null;
    constraints = [...kept, stamp({ type: 'label', kind: 'confirm', startMs: edit.startMs, endMs: edit.endMs, symbol })];
  } else if (edit.type === 'clear') {
    constraints = track.constraints.filter((item) => (item.type === 'boundary' ? !insideSpan(item.atMs) : !overlapsSpan(item)));
  } else if (edit.type === 'split') {
    // Snap to the analysis grid so the cut lands where the decoder can change.
    const { steps } = stepsFor(track);
    const atMs = steps[stepIndexAt(steps, edit.atMs)]?.startMs ?? edit.atMs;
    if (atMs <= 0) return track;
    constraints = [...track.constraints.filter((item) => !(item.type === 'merge' && item.startMs < atMs && item.endMs > atMs)
      && !(item.type === 'boundary' && item.atMs === atMs)), stamp({ type: 'boundary', atMs })];
  } else if (edit.type === 'merge') {
    // A label that starts or ends inside the span would cut it again.
    const cutsSpan = (item) => item.type === 'label' && (insideSpan(item.startMs) || insideSpan(item.endMs));
    constraints = [...track.constraints.filter((item) => !(item.type === 'boundary' && insideSpan(item.atMs)) && !cutsSpan(item)),
      stamp({ type: 'merge', startMs: edit.startMs, endMs: edit.endMs })];
  } else {
    throw new RangeError(`Edición desconocida: ${edit.type}`);
  }
  return redecodeHarmony(track, { constraints });
}

export const regionLabel = (region) => (region?.state === 'harmony' ? region.symbol : null);

/** Chords for the chart: every harmonic region, flagged confirmed or estimated. */
export function regionsForSong(track, { includeAuto = true } = {}) {
  return (track?.regions || [])
    .filter((region) => regionLabel(region) && (includeAuto || region.confirmed))
    .map((region) => ({ startMs: region.startMs, endMs: region.endMs, symbol: region.symbol, bassPitchClass: region.bassPitchClass,
      confirmed: region.confirmed, source: region.source }));
}
