import { FAMILIES, FAMILY_COUNT, N_FAMILY } from './chordVocabulary.js';

// Beat-synchronous chord decoding. One knob — "Sensibilidad de cambios" —
// maps to a switch cost and a minimum duration, so the trade-off between
// "cambia muchísimo" and "no detecta cambios" is explicit and testable.
// Values are the starting point; the evaluation harness calibrates them.

export const HARMONY_PRESETS = Object.freeze({
  // Calibrated on the synthetic bench (npm run eval:harmony): at 8 Estable
  // swallowed a one-bar Fmaj7 between two Am; the one-bar minimum already
  // keeps it stable.
  estable: Object.freeze({ id: 'estable', kappa: 14, lambdaBass: 1, switchCost: 6.5, noChordCost: 3.25, minBeats: 'bar', minMs: 1500,
    noChordMinBeats: 2, keyPrior: 0.5, colorPresence: 0.7, colorPenalty: 1.2, colorAbsentPenalty: 1.5, colorSwitch: null, colorHoldBeats: null,
    bassSplitBeats: null, bassSwitch: null }),
  // Colors switch cheaply inside a region: the "sustained note" check on each
  // sub-run (and its per-step twin, colorAbsentPenalty), not the switch cost,
  // is what keeps invented sevenths out.
  normal: Object.freeze({ id: 'normal', kappa: 14, lambdaBass: 1, switchCost: 5.5, noChordCost: 2.75, minBeats: 2, minMs: 700,
    noChordMinBeats: 1, keyPrior: 0.25, colorPresence: 0.6, colorPenalty: 0.4, colorAbsentPenalty: 1.5, colorSwitch: 1.5, colorHoldBeats: 4,
    bassSplitBeats: 4, bassSwitch: 4 }),
  detallada: Object.freeze({ id: 'detallada', kappa: 14, lambdaBass: 1, switchCost: 3.5, noChordCost: 1.75, minBeats: 1, minMs: 250,
    noChordMinBeats: 1, keyPrior: 0, colorPresence: 0.5, colorPenalty: 0.3, colorAbsentPenalty: 1.5, colorSwitch: 1, colorHoldBeats: 2,
    bassSplitBeats: 2, bassSwitch: 2.5 }),
});

export const DEFAULT_SENSITIVITY = 'normal';
export const presetFor = (sensitivity) => HARMONY_PRESETS[sensitivity] || HARMONY_PRESETS[DEFAULT_SENSITIVITY];

const NEG = -1e9;
const logSumExp = (a, b) => {
  if (a === -Infinity || a <= NEG) return b;
  if (b === -Infinity || b <= NEG) return a;
  const max = Math.max(a, b);
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
};

/**
 * Generic segment decoder over K labels with a minimum duration per label
 * (state expansion), a K×K switch cost and optional structural constraints.
 * Emissions are log scores (T×K row-major). Returns the Viterbi label path
 * plus, when requested, per-step posteriors and the probability that a new
 * segment starts at each step.
 * @param {{emissions:Float64Array, T:number, K:number, minSteps:ArrayLike<number>, switchCost:Float64Array,
 *   relaxed?:Uint8Array, freeChange?:Uint8Array, noChange?:Uint8Array, withPosteriors?:boolean}} input
 *   relaxed[t]: a segment may end before its minimum at the t-1→t transition.
 *   freeChange[t]: like relaxed, and switching there costs nothing (a boundary
 *   the musician marked: the label changes only if the audio asks for it).
 *   noChange[t]: the label must not change at t.
 */
export function decodeSegments({ emissions, T, K, minSteps, switchCost, relaxed = null, freeChange = null, noChange = null, withPosteriors = false }) {
  const offsets = new Int32Array(K + 1);
  for (let k = 0; k < K; k++) offsets[k + 1] = offsets[k] + Math.max(1, Math.round(minSteps[k]));
  const S = offsets[K];
  const labelOf = new Int32Array(S);
  const subOf = new Int32Array(S);
  for (let k = 0; k < K; k++) for (let s = offsets[k]; s < offsets[k + 1]; s++) { labelOf[s] = k; subOf[s] = s - offsets[k]; }
  const last = (k) => offsets[k + 1] - 1;

  // Viterbi
  let score = new Float64Array(S);
  for (let s = 0; s < S; s++) score[s] = emissions[labelOf[s]];
  const back = new Int32Array(T * S).fill(-1);
  let next = new Float64Array(S);
  const bestExit = new Float64Array(K);
  const bestExitState = new Int32Array(K);
  const costAt = (t, from, to) => (freeChange?.[t] ? 0 : switchCost[from * K + to]);
  for (let t = 1; t < T; t++) {
    const early = relaxed?.[t] || freeChange?.[t];
    for (let k = 0; k < K; k++) {
      let best = score[last(k)], arg = last(k);
      if (early) for (let s = offsets[k]; s < last(k); s++) if (score[s] > best) { best = score[s]; arg = s; }
      bestExit[k] = best; bestExitState[k] = arg;
    }
    for (let k = 0; k < K; k++) {
      const emission = emissions[t * K + k];
      for (let s = offsets[k]; s < offsets[k + 1]; s++) {
        let best = NEG, arg = -1;
        const sub = subOf[s];
        if (sub > 0 && score[s - 1] > best) { best = score[s - 1]; arg = s - 1; }
        if (s === last(k) && score[s] > best) { best = score[s]; arg = s; }
        if (sub === 0 && !noChange?.[t]) {
          for (let from = 0; from < K; from++) {
            if (from === k) continue;
            const candidate = bestExit[from] - costAt(t, from, k);
            if (candidate > best) { best = candidate; arg = bestExitState[from]; }
          }
        }
        next[s] = best + emission;
        back[t * S + s] = arg;
      }
    }
    [score, next] = [next, score];
  }
  let end = 0;
  for (let s = 1; s < S; s++) if (score[s] > score[end]) end = s;
  const path = new Int32Array(T);
  for (let t = T - 1, s = end; t >= 0; t--) {
    path[t] = labelOf[s];
    s = t > 0 ? back[t * S + s] : s;
    if (s < 0) s = 0;
  }
  if (!withPosteriors) return { path };

  // Forward-backward on the same expanded chain (log domain).
  const alpha = new Float64Array(T * S), beta = new Float64Array(T * S);
  for (let s = 0; s < S; s++) alpha[s] = emissions[labelOf[s]];
  const exitSum = new Float64Array(K);
  for (let t = 1; t < T; t++) {
    const early = relaxed?.[t] || freeChange?.[t];
    const prev = (t - 1) * S;
    for (let k = 0; k < K; k++) {
      let total = alpha[prev + last(k)];
      if (early) for (let s = offsets[k]; s < last(k); s++) total = logSumExp(total, alpha[prev + s]);
      exitSum[k] = total;
    }
    for (let k = 0; k < K; k++) {
      const emission = emissions[t * K + k];
      for (let s = offsets[k]; s < offsets[k + 1]; s++) {
        let total = -Infinity;
        if (subOf[s] > 0) total = logSumExp(total, alpha[prev + s - 1]);
        if (s === last(k)) total = logSumExp(total, alpha[prev + s]);
        if (subOf[s] === 0 && !noChange?.[t]) {
          for (let from = 0; from < K; from++) if (from !== k) total = logSumExp(total, exitSum[from] - costAt(t, from, k));
        }
        alpha[t * S + s] = total + emission;
      }
    }
  }
  for (let s = 0; s < S; s++) beta[(T - 1) * S + s] = 0;
  const enter = new Float64Array(K);
  for (let t = T - 1; t >= 1; t--) {
    const early = relaxed?.[t] || freeChange?.[t];
    const here = t * S, prev = (t - 1) * S;
    for (let k = 0; k < K; k++) enter[k] = noChange?.[t] ? -Infinity : beta[here + offsets[k]] + emissions[t * K + k];
    for (let k = 0; k < K; k++) {
      let switchOut = -Infinity;
      for (let to = 0; to < K; to++) if (to !== k) switchOut = logSumExp(switchOut, enter[to] - costAt(t, k, to));
      for (let s = offsets[k]; s < offsets[k + 1]; s++) {
        let total = -Infinity;
        if (s < last(k)) total = logSumExp(total, beta[here + s + 1] + emissions[t * K + k]);
        if (s === last(k)) total = logSumExp(total, beta[here + s] + emissions[t * K + k]);
        if (s === last(k) || early) total = logSumExp(total, switchOut);
        beta[prev + s] = total;
      }
    }
  }
  let logZ = -Infinity;
  for (let s = 0; s < S; s++) logZ = logSumExp(logZ, alpha[(T - 1) * S + s]);
  const posterior = new Float64Array(T * K);
  const changeProb = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    for (let s = 0; s < S; s++) {
      const value = alpha[t * S + s] + beta[t * S + s] - logZ;
      if (value > -700) posterior[t * K + labelOf[s]] += Math.exp(value);
    }
    if (t === 0) continue;
    const early = relaxed?.[t] || freeChange?.[t];
    const prev = (t - 1) * S;
    if (noChange?.[t]) continue;
    for (let k = 0; k < K; k++) {
      let total = alpha[prev + last(k)];
      if (early) for (let s = offsets[k]; s < last(k); s++) total = logSumExp(total, alpha[prev + s]);
      exitSum[k] = total;
    }
    let change = -Infinity;
    for (let k = 0; k < K; k++) {
      const into = beta[t * S + offsets[k]] + emissions[t * K + k] - logZ;
      for (let from = 0; from < K; from++) if (from !== k) change = logSumExp(change, exitSum[from] - costAt(t, from, k) + into);
    }
    changeProb[t] = Math.min(1, Math.exp(change));
  }
  return { path, posterior, changeProb };
}

// ---------- Family emissions ----------

const TEMPLATE_WEIGHTS = [1, 1, 0.8]; // root, third, fifth
const FAMILY_TEMPLATES = FAMILIES.map((family) => {
  const template = new Float64Array(12);
  if (!family.tones.length) return template.fill(1 / Math.sqrt(12));
  family.tones.forEach((pc, index) => { template[pc] = TEMPLATE_WEIGHTS[index]; });
  const norm = Math.hypot(...template);
  return template.map((value) => value / norm);
});
const BASS_EXPECTATION = FAMILIES.map((family) => {
  const expectation = new Float64Array(12).fill(family.tones.length ? 0.15 / 9 : 1 / 12);
  if (family.tones.length) { expectation[family.tones[0]] = 0.55; expectation[family.tones[1]] = 0.15; expectation[family.tones[2]] = 0.15; }
  return expectation;
});

/** Compressed, L2-normalized treble chroma (√ keeps a loud melody note from dominating). */
export function compressedChroma(treble) {
  const max = Math.max(0, ...treble);
  const out = new Float64Array(12);
  if (!(max > 0)) return out;
  for (let pc = 0; pc < 12; pc++) out[pc] = Math.sqrt(Math.max(0, treble[pc]) / max);
  const norm = Math.hypot(...out) || 1;
  for (let pc = 0; pc < 12; pc++) out[pc] /= norm;
  return out;
}

/** How much the bass register can be trusted in a step (0..1). */
export function bassReliability(step) {
  if (!(step.trebleEnergy > 0)) return 0;
  return Math.min(1, Math.max(0, (step.bassEnergy / step.trebleEnergy - 0.05) / 0.25));
}

/**
 * Log-score per step and family (T×25).
 * @param {Array} steps from aggregateSteps
 * @param {{preset:object, prior?:Float64Array, allowed?:Array<Set<number>|null>}} options
 */
export function computeFamilyEmissions(steps, { preset, prior = null, allowed = null }) {
  const T = steps.length, K = FAMILY_COUNT;
  const emissions = new Float64Array(T * K);
  steps.forEach((step, t) => {
    const row = t * K;
    const weight = step.weight ?? 1;
    const silent = step.silentFraction >= 0.65;
    const x = compressedChroma(step.treble);
    const flat = x.every((value) => value === 0);
    if (silent || flat) {
      for (let k = 0; k < K; k++) emissions[row + k] = k === N_FAMILY ? 0 : NEG;
    } else {
      const beta = bassReliability(step);
      const bassTotal = step.bass.reduce((sum, value) => sum + Math.max(0, value), 0);
      const tMax = Math.max(...step.treble);
      const strong = step.treble.filter((value) => value / tMax >= 0.25).length;
      for (let k = 0; k < K; k++) {
        const template = FAMILY_TEMPLATES[k];
        let cosine = 0;
        for (let pc = 0; pc < 12; pc++) cosine += x[pc] * template[pc];
        if (k === N_FAMILY) {
          emissions[row + k] = weight * (preset.kappa * cosine + (strong <= 1 ? 4 : -1));
          continue;
        }
        let bassTerm = 0;
        if (beta > 0 && bassTotal > 0) {
          let expected = 0;
          for (let pc = 0; pc < 12; pc++) expected += (Math.max(0, step.bass[pc]) / bassTotal) * BASS_EXPECTATION[k][pc];
          bassTerm = Math.log(expected + 1e-3) - Math.log(1 / 12);
        }
        emissions[row + k] = weight * (preset.kappa * cosine + preset.lambdaBass * beta * bassTerm + (prior ? prior[k] : 0));
      }
    }
    const mask = allowed?.[t];
    if (mask) for (let k = 0; k < K; k++) if (!mask.has(k)) emissions[row + k] = NEG;
  });
  return emissions;
}

export function familySwitchCosts(preset) {
  const K = FAMILY_COUNT;
  const costs = new Float64Array(K * K);
  for (let from = 0; from < K; from++) {
    for (let to = 0; to < K; to++) {
      if (from === to) continue;
      costs[from * K + to] = from === N_FAMILY || to === N_FAMILY ? preset.noChordCost : preset.switchCost;
    }
  }
  return costs;
}

/** Minimum duration per family in steps, with a millisecond floor against double-tempo beats. */
export function familyMinSteps(preset, { stepsPerBeat, beatsPerBar, stepMs }) {
  const beats = preset.minBeats === 'bar' ? beatsPerBar : preset.minBeats;
  const chordSteps = Math.max(1, Math.round(beats * stepsPerBeat), Math.ceil(preset.minMs / Math.max(1, stepMs)));
  const noChordSteps = Math.max(1, Math.round(preset.noChordMinBeats * stepsPerBeat));
  return Array.from({ length: FAMILY_COUNT }, (_, k) => (k === N_FAMILY ? noChordSteps : Math.min(chordSteps, 32)));
}
