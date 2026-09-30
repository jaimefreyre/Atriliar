import { FAMILY_COUNT, familyIndex } from './chordVocabulary.js';

// Global key estimate (Krumhansl–Kessler profiles, Pearson correlation) and a
// gentle diatonic prior for the decoder. Detallada uses no prior at all, so
// modulations and borrowed chords are never forced into the home key.

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const mod12 = (value) => ((value % 12) + 12) % 12;

function pearson(a, b) {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - meanA) * (b[i] - meanB); da += (a[i] - meanA) ** 2; db += (b[i] - meanB) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * @param {Array<{treble:ArrayLike<number>, bass:ArrayLike<number>, durationMs:number, silentFraction?:number}>} steps
 * @returns {{tonic:number|null, mode:'maj'|'min'|null, confidence:number, correlation:number}}
 */
export function estimateKey(steps) {
  const profile = Array(12).fill(0);
  for (const step of steps) {
    if ((step.silentFraction ?? 0) >= 0.65) continue;
    const tMax = Math.max(0, ...step.treble), bMax = Math.max(0, ...step.bass);
    const durationMs = step.durationMs ?? step.endMs - step.startMs;
    for (let pc = 0; pc < 12; pc++) {
      profile[pc] += durationMs * ((tMax ? step.treble[pc] / tMax : 0) + 0.5 * (bMax ? step.bass[pc] / bMax : 0));
    }
  }
  if (profile.every((value) => value === 0)) return { tonic: null, mode: null, confidence: 0, correlation: 0 };
  const scores = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, pc) => profile[mod12(pc + tonic)]);
    scores.push({ tonic, mode: 'maj', r: pearson(rotated, KK_MAJOR) });
    scores.push({ tonic, mode: 'min', r: pearson(rotated, KK_MINOR) });
  }
  scores.sort((a, b) => b.r - a.r);
  return { tonic: scores[0].tonic, mode: scores[0].mode, confidence: scores[0].r - scores[1].r, correlation: scores[0].r };
}

/** Per-family additive prior: +ρ diatonic, 0 common borrowed, −ρ/2 the rest. */
export function diatonicPrior(key, rho) {
  const prior = new Float64Array(FAMILY_COUNT);
  if (!key || !Number.isInteger(key.tonic) || !(rho > 0) || key.confidence < 0.05) return prior;
  const t = key.tonic;
  const diatonic = key.mode === 'maj'
    ? [[t, 'maj'], [t + 5, 'maj'], [t + 7, 'maj'], [t + 2, 'min'], [t + 4, 'min'], [t + 9, 'min']]
    : [[t, 'min'], [t + 5, 'min'], [t + 7, 'min'], [t + 3, 'maj'], [t + 8, 'maj'], [t + 10, 'maj']];
  const borrowed = key.mode === 'maj'
    ? [[t + 10, 'maj'], [t + 8, 'maj'], [t + 2, 'maj'], [t + 5, 'min']]
    : [[t + 7, 'maj'], [t + 5, 'maj']];
  for (let index = 1; index < FAMILY_COUNT; index++) prior[index] = -rho / 2;
  for (const [root, mode] of borrowed) prior[familyIndex(root, mode)] = 0;
  for (const [root, mode] of diatonic) prior[familyIndex(root, mode)] = rho;
  return prior;
}
