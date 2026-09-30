import { FAMILIES, N_FAMILY, VARIANTS_BY_MODE, formatChordSymbol, sameNoteTwins } from './chordVocabulary.js';
import { decodeSegments, compressedChroma, bassReliability } from './chordDecoder.js';

// Level 2, inside each decoded region: colors only when the extra note is
// sustained, slash chords only when the bass is held, and a walking or
// alternating bass never splits a region.

const mod12 = (value) => ((value % 12) + 12) % 12;

// Root and third (or the sus tone that replaces it) weigh 1, the fifth 0.8,
// an altered fifth 1 and any added color 0.8 — same scale as level 1.
function toneWeight(interval, variant) {
  if (interval === 0 || interval === 3 || interval === 4) return 1;
  if ((interval === 2 || interval === 5) && variant.replaces.some((replaced) => replaced === 3 || replaced === 4)) return 1;
  if (interval === 7) return 0.8;
  if ((interval === 6 || interval === 8) && variant.replaces.includes(7)) return 1;
  return 0.8;
}

function variantTemplate(root, variant) {
  const template = new Float64Array(12);
  variant.intervals.forEach((interval) => { template[mod12(root + interval)] = toneWeight(interval, variant); });
  const norm = Math.hypot(...template) || 1;
  return template.map((value) => value / norm);
}

function presence(step) {
  const max = Math.max(0, ...step.treble);
  return max > 0 ? Array.from(step.treble, (value) => Math.max(0, value) / max) : Array(12).fill(0);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Does the region sustain this color? Returns the evidence used, not just a verdict. */
export function variantEvidence(steps, root, variant, preset) {
  const presences = steps.map(presence);
  const adds = variant.adds.map((interval) => {
    const pc = mod12(root + interval);
    const fraction = presences.filter((p) => p[pc] >= ADDED_PRESENT).length / presences.length;
    return { pc, fraction };
  });
  const replaced = variant.replaces.map((interval) => {
    const pc = mod12(root + interval);
    return { pc, median: median(presences.map((p) => p[pc])) };
  });
  const accepted = adds.every((item) => item.fraction >= preset.colorPresence) && replaced.every((item) => item.median <= REPLACED_GONE);
  return { accepted, adds, replaced };
}

// Per-step thresholds shared with variantEvidence: an added tone counts as
// present from 0.3 of the loudest bin, a replaced tone as gone below 0.2.
const ADDED_PRESENT = 0.3;
const REPLACED_GONE = 0.2;

/**
 * Score of one variant on one step. A color also pays, on every step where its
 * distinctive note is missing, the same thing the sustained-note check looks
 * at; otherwise leakage lets a maj7 run swallow the plain bar before it and
 * the whole run is then rejected as a unit.
 */
function stepVariantScore(step, candidate, preset) {
  const x = compressedChroma(step.treble);
  let cosine = 0;
  for (let pc = 0; pc < 12; pc++) cosine += x[pc] * candidate.template[pc];
  let penalty = 0;
  if (candidate.index !== 0) {
    penalty = preset.colorPenalty;
    const p = presence(step);
    if (candidate.addedPcs.some((pc) => p[pc] < ADDED_PRESENT) || candidate.replacedPcs.some((pc) => p[pc] > REPLACED_GONE)) penalty += preset.colorAbsentPenalty;
  }
  return (step.weight ?? 1) * (preset.kappa * cosine - penalty);
}

function makeCandidate(family, variant, index) {
  return { variant, index, template: variantTemplate(family.root, variant),
    addedPcs: variant.adds.map((interval) => mod12(family.root + interval)),
    replacedPcs: variant.replaces.map((interval) => mod12(family.root + interval)) };
}

function acceptedOn(steps, family, candidate, preset) {
  return candidate.index === 0 ? { accepted: true, adds: [], replaced: [] } : variantEvidence(steps, family.root, candidate.variant, preset);
}

/**
 * Colors inside one region. Candidate sub-runs come from a small HMM over all
 * variants of the family; each sub-run then has to pass the "sustained note"
 * check on its own steps or falls back to the plain triad. Evaluating the
 * check per sub-run is what lets a C–Cmaj7–C7–C6 cliché survive.
 */
export function chooseVariants(steps, family, preset, stepsPerBeat) {
  const candidates = VARIANTS_BY_MODE[family.mode].map((variant, index) => makeCandidate(family, variant, index));
  const scores = candidates.map((candidate) => steps.map((step) => stepVariantScore(step, candidate, preset)));
  const totals = scores.map((row) => row.reduce((sum, value) => sum + value, 0));
  const triad = candidates[0];
  let runs;
  if (!preset.colorSwitch || steps.length < 2) {
    const ranked = candidates.map((candidate, index) => ({ candidate, total: totals[index] })).sort((a, b) => b.total - a.total);
    const chosen = ranked.find(({ candidate }) => acceptedOn(steps, family, candidate, preset).accepted)?.candidate || triad;
    runs = [{ start: 0, end: steps.length, candidate: chosen }];
  } else {
    const K = candidates.length, T = steps.length;
    const emissions = new Float64Array(T * K);
    for (let t = 0; t < T; t++) for (let k = 0; k < K; k++) emissions[t * K + k] = scores[k][t];
    const hold = Math.max(1, Math.round(preset.colorHoldBeats * stepsPerBeat));
    const { path } = decodeSegments({ emissions, T, K, minSteps: Array(K).fill(hold), switchCost: new Float64Array(K * K).fill(preset.colorSwitch) });
    runs = [];
    for (let t = 0; t < T; t++) {
      if (runs.length && runs.at(-1).candidate === candidates[path[t]]) runs.at(-1).end = t + 1;
      else runs.push({ start: t, end: t + 1, candidate: candidates[path[t]] });
    }
    for (const run of runs) {
      if (!acceptedOn(steps.slice(run.start, run.end), family, run.candidate, preset).accepted) run.candidate = triad;
    }
    runs = runs.reduce((merged, run) => {
      if (merged.length && merged.at(-1).candidate === run.candidate) merged.at(-1).end = run.end;
      else merged.push({ ...run });
      return merged;
    }, []);
  }
  for (const run of runs) run.candidate = { ...run.candidate, evidence: acceptedOn(steps.slice(run.start, run.end), family, run.candidate, preset) };
  return { runs, candidates, totals };
}

function bassRuns(steps, preset, stepsPerBeat) {
  const T = steps.length;
  if (!preset.bassSplitBeats || T < 2) return [{ start: 0, end: T }];
  const hold = Math.max(1, Math.round(preset.bassSplitBeats * stepsPerBeat));
  if (T < 2 * hold) return [{ start: 0, end: T }];
  const emissions = new Float64Array(T * 12);
  steps.forEach((step, t) => {
    const total = step.bass.reduce((sum, value) => sum + Math.max(0, value), 0);
    const reliable = bassReliability(step) > 0.2 && total > 0;
    for (let pc = 0; pc < 12; pc++) {
      emissions[t * 12 + pc] = reliable ? (step.weight ?? 1) * Math.log(Math.max(0, step.bass[pc]) / total + 0.02) : 0;
    }
  });
  const { path } = decodeSegments({ emissions, T, K: 12, minSteps: Array(12).fill(hold), switchCost: new Float64Array(144).fill(preset.bassSwitch) });
  const runs = [];
  for (let t = 0; t < T; t++) {
    if (runs.length && runs.at(-1).pc === path[t]) runs.at(-1).end = t + 1;
    else runs.push({ start: t, end: t + 1, pc: path[t] });
  }
  return runs;
}

/**
 * Slash decision over a span: a clearly dominant bass that isn't the root and
 * is actually held (a walking line that visits one note twice doesn't count).
 */
function slashBass(steps, root, variant, minHeldBeats = 2) {
  const betas = steps.map(bassReliability);
  const meanBeta = betas.reduce((sum, value) => sum + value, 0) / steps.length;
  const counts = new Array(12).fill(0);
  const argmax = steps.map((step, index) => {
    if (betas[index] < 0.2) return -1;
    const max = Math.max(...step.bass);
    return max > 0 ? step.bass.indexOf(max) : -1;
  });
  let considered = 0;
  argmax.forEach((pc) => { if (pc >= 0) { counts[pc]++; considered++; } });
  if (!considered) return { bassPitchClass: null, share: 0, meanBeta, confidence: 0 };
  const ranked = counts.map((count, pc) => ({ pc, share: count / considered })).sort((a, b) => b.share - a.share);
  const [best, second] = ranked;
  const confidence = best.share * meanBeta;
  let longestBeats = 0, currentBeats = 0;
  steps.forEach((step, index) => {
    currentBeats = argmax[index] === best.pc ? currentBeats + (step.weight ?? 1) : 0;
    longestBeats = Math.max(longestBeats, currentBeats);
  });
  const held = longestBeats >= minHeldBeats - 1e-9;
  const clear = held && meanBeta >= 0.4 && best.share >= 0.45 && best.share >= 1.5 * (second?.share || 0);
  if (!clear || best.pc === root) return { bassPitchClass: null, share: best.share, meanBeta, confidence, candidate: best.pc };
  const chordTones = variant.intervals.map((interval) => mod12(root + interval));
  if (chordTones.includes(best.pc)) return { bassPitchClass: best.pc, share: best.share, meanBeta, confidence };
  const presences = steps.map(presence);
  const missingSeventh = [10, 11].some((interval) => mod12(root + interval) === best.pc)
    && median(presences.map((p) => p[best.pc])) < 0.2;
  if (missingSeventh || best.share >= 0.6) return { bassPitchClass: best.pc, share: best.share, meanBeta, confidence };
  return { bassPitchClass: null, share: best.share, meanBeta, confidence, candidate: best.pc };
}

function meanOf(steps, key) {
  const out = new Float64Array(12);
  for (const step of steps) {
    const max = Math.max(0, ...step[key]);
    if (max > 0) for (let pc = 0; pc < 12; pc++) out[pc] += step[key][pc] / max;
  }
  const max = Math.max(0, ...out);
  return Array.from(out, (value) => (max > 0 ? Number((value / max).toFixed(3)) : 0));
}

function alternativesFor({ family, candidate, candidates, totals, familyPosterior, slash, key }) {
  const list = [];
  familyPosterior.forEach((value, index) => {
    if (index === family.index || index === N_FAMILY || value < 0.05) return;
    const other = FAMILIES[index];
    list.push({ symbol: formatChordSymbol({ root: other.root, quality: other.mode === 'min' ? 'm' : '', key }), score: value, reason: 'otra-raiz' });
  });
  const bestTotal = Math.max(...totals);
  candidates.forEach((item, index) => {
    if (item.index === candidate.index) return;
    list.push({ symbol: formatChordSymbol({ root: family.root, quality: item.variant.quality, key }),
      score: Math.max(0, Math.min(1, 1 - (bestTotal - totals[index]) / (Math.abs(bestTotal) + 1e-9))), reason: 'color' });
  });
  for (const twin of sameNoteTwins(family.root, candidate.variant.quality).slice(0, 2)) {
    list.push({ symbol: formatChordSymbol({ root: twin.root, quality: twin.quality, key }), score: 0.5, reason: 'mismas-notas' });
  }
  if (slash.bassPitchClass !== null && slash.confidence < 0.6) {
    list.push({ symbol: formatChordSymbol({ root: family.root, quality: candidate.variant.quality, key }), score: 1 - slash.confidence, reason: 'bajo' });
  } else if (slash.bassPitchClass === null && Number.isInteger(slash.candidate) && slash.candidate !== family.root) {
    list.push({ symbol: formatChordSymbol({ root: family.root, quality: candidate.variant.quality, bassPitchClass: slash.candidate, key }), score: slash.confidence, reason: 'bajo' });
  }
  const seen = new Set();
  return list.sort((a, b) => b.score - a.score)
    .filter((item) => !seen.has(item.symbol) && seen.add(item.symbol))
    .slice(0, 4)
    .map((item) => ({ ...item, score: Number(item.score.toFixed(3)) }));
}

/** The variant run covering most of [from, to): a merged span can hold several. */
function dominantCandidate(variantRuns, from, to) {
  let best = null, bestOverlap = -1;
  for (const item of variantRuns) {
    const overlap = Math.min(to, item.end) - Math.max(from, item.start);
    if (overlap > bestOverlap) { best = item.candidate; bestOverlap = overlap; }
  }
  return best;
}

/**
 * Turn the level-1 path into displayable regions.
 * forcedCuts[t]: the musician marked a boundary at step t, so a region starts
 * there even if the chord stays, and each side gets its own color and bass.
 * noChange[t]: the musician merged across t, so nothing splits there.
 * @returns {Array<object>} regions in time order, covering [0, durationMs)
 */
export function refineRegions({ path, steps, posterior, changeProb, grid, preset, key, durationMs, forcedCuts = null, noChange = null }) {
  const K = FAMILIES.length;
  const runs = [];
  for (let t = 0; t < path.length; t++) {
    if (runs.length && runs.at(-1).family === path[t] && !forcedCuts?.[t]) runs.at(-1).end = t + 1;
    else runs.push({ family: path[t], start: t, end: t + 1 });
  }
  const regions = [];
  for (const run of runs) {
    const runSteps = steps.slice(run.start, run.end);
    const family = FAMILIES[run.family];
    const familyPosterior = new Array(K).fill(0);
    if (posterior) for (let t = run.start; t < run.end; t++) for (let k = 0; k < K; k++) familyPosterior[k] += posterior[t * K + k] / (run.end - run.start);
    const boundaryStrength = run.start === 0 || forcedCuts?.[run.start] ? 1 : Number((changeProb?.[run.start] ?? 1).toFixed(3));
    if (run.family === N_FAMILY) {
      const silent = runSteps.filter((step) => step.silentFraction >= 0.65).length >= runSteps.length / 2;
      regions.push({ startMs: runSteps[0].startMs, endMs: runSteps.at(-1).endMs, state: silent ? 'silence' : 'no-chord', isSilence: silent,
        symbol: null, autoSymbol: null, root: null, quality: null, bassPitchClass: null, confidence: Number(familyPosterior[N_FAMILY].toFixed(3)),
        qualityConfidence: 0, bassConfidence: 0, boundaryStrength, alternatives: [], chroma: meanOf(runSteps, 'treble'), bassChroma: meanOf(runSteps, 'bass'),
        evidence: { method: 'nnls-hmm', steps: runSteps.length } });
      continue;
    }
    const { runs: variantRuns, candidates, totals } = chooseVariants(runSteps, family, preset, grid.stepsPerBeat);
    const splits = bassRuns(runSteps, preset, grid.stepsPerBeat);
    const cuts = [...new Set([0, runSteps.length, ...variantRuns.flatMap((item) => [item.start, item.end]), ...splits.flatMap((item) => [item.start, item.end])])]
      .filter((cut) => cut === 0 || cut === runSteps.length || !noChange?.[run.start + cut])
      .sort((a, b) => a - b);
    const labelFor = (from, to) => {
      let candidate = dominantCandidate(variantRuns, from, to);
      const slash = slashBass(runSteps.slice(from, to), family.root, candidate.variant);
      // A color that only lives in the bass (its own harmonics leak upward) is
      // written the way charts do: triad over bass — Am/G, C/B, not Am7/G.
      if (slash.bassPitchClass !== null && candidate.variant.adds.some((interval) => mod12(family.root + interval) === slash.bassPitchClass)) {
        candidate = { ...candidates[0], evidence: { accepted: true, adds: [], replaced: [] } };
      }
      return { from, to, candidate, slash, symbol: formatChordSymbol({ root: family.root, quality: candidate.variant.quality, bassPitchClass: slash.bassPitchClass, key }) };
    };
    // A bass or color cut that doesn't change the name isn't a change for the musician.
    const pieces = [];
    for (let index = 0; index < cuts.length - 1; index++) {
      const piece = labelFor(cuts[index], cuts[index + 1]);
      if (pieces.length && pieces.at(-1).symbol === piece.symbol) Object.assign(pieces.at(-1), labelFor(pieces.at(-1).from, piece.to));
      else pieces.push(piece);
    }
    for (let index = 0; index < pieces.length; index++) {
      const { from, to, candidate, slash, symbol } = pieces[index];
      const pieceSteps = runSteps.slice(from, to);
      const stepScores = candidates.map((item) => pieceSteps.map((step) => stepVariantScore(step, item, preset)));
      const own = stepScores[candidates.findIndex((item) => item.index === candidate.index)];
      const wins = own.filter((value, t) => stepScores.every((row) => row[t] <= value)).length;
      regions.push({
        startMs: pieceSteps[0].startMs, endMs: pieceSteps.at(-1).endMs, state: 'harmony', isSilence: false,
        symbol, autoSymbol: symbol, root: family.root, quality: candidate.variant.quality, bassPitchClass: slash.bassPitchClass,
        confidence: Number(familyPosterior[run.family].toFixed(3)),
        qualityConfidence: Number((wins / pieceSteps.length).toFixed(3)),
        bassConfidence: Number(slash.confidence.toFixed(3)),
        boundaryStrength: index === 0 ? boundaryStrength : 0.5,
        alternatives: alternativesFor({ family, candidate, candidates, totals, familyPosterior, slash, key }),
        chroma: meanOf(pieceSteps, 'treble'), bassChroma: meanOf(pieceSteps, 'bass'),
        evidence: { method: 'nnls-hmm', steps: pieceSteps.length, bassShare: Number(slash.share.toFixed(3)), bassReliability: Number(slash.meanBeta.toFixed(3)),
          color: candidate.evidence.adds.map((item) => ({ pitchClass: item.pc, sustainedFraction: Number(item.fraction.toFixed(3)) })) },
      });
    }
  }
  if (regions.length) { regions[0].startMs = 0; regions.at(-1).endMs = durationMs ?? regions.at(-1).endMs; }
  for (let index = 1; index < regions.length; index++) regions[index].startMs = regions[index - 1].endMs;
  return regions;
}
