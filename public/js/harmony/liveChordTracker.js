import { FAMILIES, FAMILY_COUNT, N_FAMILY, familyForSymbol, formatChordSymbol } from './chordVocabulary.js';
import { computeFamilyEmissions, presetFor } from './chordDecoder.js';
import { chooseVariants } from './chordRefinement.js';
import { getChordTones } from '../music/harmony.js';

// Live chord following for the microphone. A forward filter over the same 25
// families and emissions as the offline engine: the chord can change at any
// frame with probability 1 − e^(−Δt/τ), frames without usable signal only let
// the belief relax (no hard resets), and a new chord is shown only after its
// posterior stays above the entry threshold for the hold time.

// colorHoldMs: a color (7, maj7…) is judged over that much sound and must keep
// winning for half as long again, so the tail of one chord or the attack of the
// next never flashes a false C → Cmaj7 → C.
export const LIVE_PRESETS = Object.freeze({
  estable: Object.freeze({ tauMs: 1500, enter: 0.75, holdMs: 250, colorHoldMs: 1200 }),
  normal: Object.freeze({ tauMs: 800, enter: 0.65, holdMs: 150, colorHoldMs: 800 }),
  detallada: Object.freeze({ tauMs: 400, enter: 0.55, holdMs: 80, colorHoldMs: 500 }),
});

// Offline evidence is counted per beat; live windows overlap heavily, so each
// frame counts as its share of a nominal beat (300 ms: 0.3–0.5 s to show a
// change in Normal on the synthetic bench, without flicker).
const NOMINAL_BEAT_MS = 300;
const COLOR_MEMORY_MS = 1500;
const COLOR_SETTLE_MS = 200;
const COLOR_MIN_FRAMES = 4;
const PROPOSAL_MIN = 0.4;
const pitchName = (pc) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc];

function normalizedCopy(values) {
  const max = Math.max(0, ...values);
  return Array.from(values, (value) => (max > 0 ? Math.max(0, value) / max : 0));
}

/**
 * @param {{sensitivity?:string, frameMs?:number, key?:object|null}} [options]
 */
export function createLiveChordTracker({ sensitivity = 'normal', frameMs = 46, key = null, beatMs = NOMINAL_BEAT_MS } = {}) {
  const live = LIVE_PRESETS[sensitivity] || LIVE_PRESETS.normal;
  const preset = presetFor(sensitivity);
  const colorPreset = { ...preset, colorSwitch: null };
  let posterior, lastMs, confirmed, candidate, smoothed, recent, shownColor, colorCandidate;

  function reset() {
    posterior = new Float64Array(FAMILY_COUNT).fill(1 / FAMILY_COUNT);
    lastMs = null; confirmed = null; candidate = null;
    smoothed = new Float64Array(12);
    recent = []; shownColor = null; colorCandidate = null;
  }
  reset();

  function relax(dtMs) {
    const p = 1 - Math.exp(-Math.max(0, dtMs) / live.tauMs);
    for (let k = 0; k < FAMILY_COUNT; k++) posterior[k] = (1 - p) * posterior[k] + (p * (1 - posterior[k])) / (FAMILY_COUNT - 1);
  }

  const triadOf = (family) => formatChordSymbol({ root: FAMILIES[family].root, quality: FAMILIES[family].mode === 'min' ? 'm' : '', key });

  /**
   * Best color for a family over the frames since `sinceMs` (the triad if
   * there are too few). The note that dominates the bass counts half in the
   * treble: a walking bass through B (or its harmonics) is not a Cmaj7, the
   * same convention as offline (a color that lives in the bass is triad/bass).
   */
  function colorFor(family, sinceMs) {
    if (family === N_FAMILY) return null;
    const { root } = FAMILIES[family];
    const steps = recent.filter((step) => step.timeMs >= sinceMs).map((step) => {
      const bassMax = Math.max(...step.bass);
      if (!(bassMax > 0) || step.bassEnergy < 0.3 * step.trebleEnergy) return step;
      const bassPc = step.bass.indexOf(bassMax);
      if (bassPc === root) return step;
      const treble = Float64Array.from(step.treble);
      treble[bassPc] *= 0.5;
      return { ...step, treble };
    });
    if (steps.length < COLOR_MIN_FRAMES) return triadOf(family);
    // No slash chords live: an 8192-sample window cannot resolve low bass
    // notes reliably (Am/G reads as Am7, the same notes).
    const { runs } = chooseVariants(steps, FAMILIES[family], colorPreset, 1);
    return formatChordSymbol({ root, quality: runs[0].candidate.variant.quality, key });
  }

  /**
   * The confirmed chord's name, with its own hysteresis for the color: judged
   * over the last 2·colorHoldMs (never the attack right after the change),
   * shown once that judgement holds for colorHoldMs/2, and frozen while
   * another chord is taking over (its notes would read as a color).
   */
  function shownSymbol(timestampMs) {
    if (!confirmed || confirmed.family === N_FAMILY) { shownColor = null; colorCandidate = null; return null; }
    if (shownColor?.family !== confirmed.family) { shownColor = { family: confirmed.family, symbol: triadOf(confirmed.family) }; colorCandidate = null; }
    if (candidate) { colorCandidate = null; return shownColor.symbol; }
    const best = colorFor(confirmed.family, Math.max(confirmed.sinceMs + COLOR_SETTLE_MS, timestampMs - 2 * live.colorHoldMs));
    if (best === shownColor.symbol) { colorCandidate = null; return shownColor.symbol; }
    if (colorCandidate?.symbol !== best) colorCandidate = { symbol: best, sinceMs: timestampMs };
    if (timestampMs - colorCandidate.sinceMs >= live.colorHoldMs / 2) { shownColor.symbol = best; colorCandidate = null; }
    return shownColor.symbol;
  }

  /**
   * @param {{treble?:ArrayLike<number>, bass?:ArrayLike<number>, timestampMs:number, usable?:boolean, evidence?:object}} frame
   */
  function update({ treble = null, bass = null, timestampMs, usable = true, evidence = {} }) {
    const dtMs = lastMs === null ? frameMs : Math.max(0, timestampMs - lastMs);
    lastMs = timestampMs;
    relax(dtMs);
    const hasSignal = usable && treble && Math.max(0, ...treble) > 0;
    if (hasSignal) {
      const trebleArray = Float64Array.from(treble, (value) => Math.max(0, value));
      const bassArray = Float64Array.from(bass || new Array(12).fill(0), (value) => Math.max(0, value));
      const step = { treble: trebleArray, bass: bassArray, weight: Math.min(0.5, Math.max(0.02, dtMs / beatMs)),
        silentFraction: 0, trebleEnergy: trebleArray.reduce((sum, value) => sum + value, 0), bassEnergy: bassArray.reduce((sum, value) => sum + value, 0) };
      const emissions = computeFamilyEmissions([step], { preset });
      const max = Math.max(...emissions);
      let total = 0;
      for (let k = 0; k < FAMILY_COUNT; k++) { posterior[k] *= Math.exp(emissions[k] - max); total += posterior[k]; }
      for (let k = 0; k < FAMILY_COUNT; k++) posterior[k] = total > 0 ? posterior[k] / total : 1 / FAMILY_COUNT;
      const mix = 1 - Math.exp(-dtMs / 250);
      const peak = Math.max(...trebleArray) || 1;
      for (let pc = 0; pc < 12; pc++) smoothed[pc] += mix * (trebleArray[pc] / peak - smoothed[pc]);
      recent.push({ ...step, timeMs: timestampMs });
      recent = recent.filter((item) => timestampMs - item.timeMs <= COLOR_MEMORY_MS);
    }
    let best = 0;
    for (let k = 1; k < FAMILY_COUNT; k++) if (posterior[k] > posterior[best]) best = k;
    // Hysteresis: a different family must hold above the entry threshold.
    if (!confirmed || best !== confirmed.family) {
      if (hasSignal && posterior[best] >= live.enter) {
        if (candidate?.family !== best) candidate = { family: best, sinceMs: timestampMs };
        if (timestampMs - candidate.sinceMs >= live.holdMs) {
          confirmed = { family: best, sinceMs: candidate.sinceMs };
          candidate = null;
        }
      } else candidate = null;
    } else candidate = null;
    const confirmedSymbol = shownSymbol(timestampMs);
    const proposalFamily = posterior[best] >= PROPOSAL_MIN && best !== N_FAMILY ? best : null;
    const proposalSymbol = proposalFamily === null ? null
      : proposalFamily === confirmed?.family ? confirmedSymbol : triadOf(proposalFamily);
    return {
      confirmed: confirmed && confirmedSymbol ? { symbol: confirmedSymbol, family: confirmed.family, score: posterior[confirmed.family], sinceMs: confirmed.sinceMs } : null,
      noChord: confirmed?.family === N_FAMILY,
      proposal: proposalFamily === null ? null : { symbol: proposalSymbol, family: proposalFamily, score: posterior[proposalFamily] },
      pendingMs: candidate ? Math.max(0, timestampMs - candidate.sinceMs) : 0,
      holdMs: live.holdMs,
      posterior: Float64Array.from(posterior),
      chroma: normalizedCopy(smoothed),
      evidence: { ...evidence },
    };
  }

  return { update, reset, get settings() { return { ...live, sensitivity: preset.id }; } };
}

/**
 * "¿Estás tocando el acorde esperado?" The expected chords are the ones the
 * chart has around the (latency-compensated) position; V is the log ratio of
 * the tracker's belief in them against the best other family.
 *   coincide    V ≥ +1 held ≥ matchMs, every chord tone present
 *   parcial     V ≥ +1 held, but a tone of the expected chord is missing
 *   no-coincide V ≤ −1 held ≥ mismatchMs ("suena como X")
 * Between decisions the last stable verdict stays, flagged as pending.
 */
export function createChordVerifier({ matchMs = 200, mismatchMs = 300, margin = 1, tonePresence = 0.3 } = {}) {
  let run = null, runSince = null, stable = { status: 'sin-referencia' };
  function reset() { run = null; runSince = null; stable = { status: 'sin-referencia' }; }
  function update({ expected = [], result, timestampMs }) {
    const candidates = [...new Set(expected.filter(Boolean))]
      .map((symbol) => ({ symbol, family: familyForSymbol(symbol) }))
      .filter((item) => Number.isInteger(item.family) && item.family !== N_FAMILY);
    if (!candidates.length || !result?.posterior) { reset(); return stable; }
    const families = new Set(candidates.map((item) => item.family));
    const target = candidates.reduce((bestItem, item) => (result.posterior[item.family] > result.posterior[bestItem.family] ? item : bestItem));
    let other = 0;
    result.posterior.forEach((value, family) => { if (!families.has(family)) other = Math.max(other, value); });
    const V = Math.log((result.posterior[target.family] + 1e-9) / (other + 1e-9));
    const instant = V >= margin ? 'match' : V <= -margin ? 'mismatch' : 'unsure';
    if (instant !== run) { run = instant; runSince = timestampMs; }
    const held = timestampMs - runSince;
    if (run === 'match' && held >= matchMs) {
      const tones = getChordTones(target.symbol).tones || [];
      const missing = tones.filter((pc) => (result.chroma?.[pc] ?? 0) < tonePresence).map(pitchName);
      stable = missing.length ? { status: 'parcial', expected: target.symbol, missing, V } : { status: 'coincide', expected: target.symbol, V };
    } else if (run === 'mismatch' && held >= mismatchMs) {
      stable = { status: 'no-coincide', expected: target.symbol, soundsLike: result.confirmed?.symbol || result.proposal?.symbol || null, V };
    } else {
      return { ...stable, pending: true, V, expected: target.symbol };
    }
    return stable;
  }
  return { update, reset };
}
