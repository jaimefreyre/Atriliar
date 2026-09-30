import { getChordTones } from '../music/harmony.js';

// Chord-recognition metrics (MIREX-style). Segments are {startMs, endMs,
// symbol}; 'N' or null means no chord. The two segmentation scores map the
// user's complaint directly: over-segmentation = "cambia muchísimo",
// under-segmentation = "no detecta muchos cambios". 1 is perfect for both.

const MAJ_TYPES = new Set(['', '7', 'maj7', '6', 'add9', '9', 'maj9', '13']);
const MIN_TYPES = new Set(['m', 'm7', 'm6', 'm9', 'madd9']);
const SEVENTHS = { '': 'maj', m: 'min', 7: '7', maj7: 'maj7', m7: 'min7' };

function parse(symbol) {
  if (!symbol || symbol === 'N') return null;
  const chord = getChordTones(symbol);
  if (!chord.recognized) return undefined;
  return { root: chord.rootPitchClass, quality: chord.parsed.qualityId, bass: Number.isInteger(chord.bassPitchClass) ? chord.bassPitchClass : chord.rootPitchClass };
}

/** Map a chord symbol into a comparison vocabulary; 'X' means "excluded from scoring". */
export function mapLabel(symbol, vocabulary = 'majmin') {
  const chord = parse(symbol);
  if (chord === null) return 'N';
  if (chord === undefined) return 'X';
  if (vocabulary === 'root') return String(chord.root);
  const family = MAJ_TYPES.has(chord.quality) ? 'maj' : MIN_TYPES.has(chord.quality) ? 'min' : null;
  if (vocabulary === 'majmin') return family ? `${chord.root}:${family}` : 'X';
  if (vocabulary === 'majmin_inv') return family ? `${chord.root}:${family}/${chord.bass}` : 'X';
  if (vocabulary === 'sevenths') return chord.quality in SEVENTHS ? `${chord.root}:${SEVENTHS[chord.quality]}` : 'X';
  throw new RangeError(`Vocabulario desconocido: ${vocabulary}`);
}

function normalizeSegments(segments, durationMs) {
  return segments
    .map((segment) => ({ startMs: Math.max(0, segment.startMs), endMs: Math.min(durationMs, segment.endMs), symbol: segment.symbol || 'N' }))
    .filter((segment) => segment.endMs > segment.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

function labelAt(segments, timeMs) {
  const hit = segments.find((segment) => timeMs >= segment.startMs && timeMs < segment.endMs);
  return hit ? hit.symbol : 'N';
}

/** Pieces of the timeline where both labels are constant. */
function overlapPieces(reference, estimate, durationMs) {
  const cuts = [...new Set([0, durationMs, ...reference.flatMap((s) => [s.startMs, s.endMs]), ...estimate.flatMap((s) => [s.startMs, s.endMs])])]
    .filter((time) => time >= 0 && time <= durationMs).sort((a, b) => a - b);
  const pieces = [];
  for (let index = 0; index < cuts.length - 1; index++) {
    const startMs = cuts[index], endMs = cuts[index + 1];
    if (endMs <= startMs) continue;
    const middle = (startMs + endMs) / 2;
    pieces.push({ startMs, endMs, reference: labelAt(reference, middle), estimate: labelAt(estimate, middle) });
  }
  return pieces;
}

/** Weighted chord symbol recall: share of (non-excluded) reference time labeled correctly. */
export function wcsr(reference, estimate, { durationMs, vocabulary = 'majmin' }) {
  let correct = 0, total = 0;
  for (const piece of overlapPieces(normalizeSegments(reference, durationMs), normalizeSegments(estimate, durationMs), durationMs)) {
    const expected = mapLabel(piece.reference, vocabulary);
    if (expected === 'X') continue;
    const length = piece.endMs - piece.startMs;
    total += length;
    if (mapLabel(piece.estimate, vocabulary) === expected) correct += length;
  }
  return total ? correct / total : null;
}

function mergeRuns(segments, vocabulary) {
  const runs = [];
  for (const segment of segments) {
    const label = vocabulary ? mapLabel(segment.symbol, vocabulary) : segment.symbol;
    const last = runs.at(-1);
    if (last && last.label === label && last.endMs === segment.startMs) last.endMs = segment.endMs;
    else runs.push({ startMs: segment.startMs, endMs: segment.endMs, label });
  }
  return runs;
}

function directionalHamming(from, to, durationMs) {
  let missing = 0;
  for (const segment of from) {
    let best = 0;
    for (const other of to) best = Math.max(best, Math.min(segment.endMs, other.endMs) - Math.max(segment.startMs, other.startMs));
    missing += (segment.endMs - segment.startMs) - best;
  }
  return missing / durationMs;
}

/**
 * Directional Hamming distances over label runs (written symbols by default).
 * overSegmentation: reference runs split across many estimated runs.
 * underSegmentation: estimated runs spanning several reference runs.
 */
export function segmentationScores(reference, estimate, { durationMs, vocabulary = null }) {
  // Runs are built from the written symbols by default: mapping first would
  // fuse every excluded chord (power chords, sus…) into one long run.
  const ref = mergeRuns(normalizeSegments(reference, durationMs), vocabulary);
  const est = mergeRuns(normalizeSegments(estimate, durationMs), vocabulary);
  const overSegmentation = 1 - directionalHamming(ref, est, durationMs);
  const underSegmentation = 1 - directionalHamming(est, ref, durationMs);
  return { overSegmentation, underSegmentation, segmentation: Math.min(overSegmentation, underSegmentation) };
}

/**
 * Boundary precision/recall with greedy one-to-one matching. Estimated
 * boundaries are raw region starts: two adjacent "C" regions still count as a
 * visible change for the musician.
 */
export function boundaryScores(reference, estimate, { durationMs, toleranceMs = 250 }) {
  const refBoundaries = mergeRuns(normalizeSegments(reference, durationMs), null).slice(1).map((run) => run.startMs);
  const estBoundaries = normalizeSegments(estimate, durationMs).slice(1).map((segment) => segment.startMs);
  const pairs = [];
  refBoundaries.forEach((ref, refIndex) => estBoundaries.forEach((est, estIndex) => {
    const distance = Math.abs(ref - est);
    if (distance <= toleranceMs) pairs.push({ refIndex, estIndex, distance });
  }));
  pairs.sort((a, b) => a.distance - b.distance);
  const usedRef = new Set(), usedEst = new Set();
  for (const pair of pairs) {
    if (usedRef.has(pair.refIndex) || usedEst.has(pair.estIndex)) continue;
    usedRef.add(pair.refIndex); usedEst.add(pair.estIndex);
  }
  const matched = usedRef.size;
  const precision = estBoundaries.length ? matched / estBoundaries.length : 1;
  const recall = refBoundaries.length ? matched / refBoundaries.length : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, spurious: estBoundaries.length - matched, missed: refBoundaries.length - matched,
    referenceCount: refBoundaries.length, estimateCount: estBoundaries.length };
}

export function changesPerMinute(segments, durationMs) {
  const count = normalizeSegments(segments, durationMs).length;
  return durationMs > 0 ? (Math.max(0, count - 1) / durationMs) * 60000 : 0;
}

/**
 * Everything the evaluation harness reports for one estimate.
 * noChordRecall only looks at reference silences of at least minSilenceMs: a
 * release tail of a few hundred milliseconds still sounds like the last chord.
 */
export function evaluateHarmony(reference, estimate, { durationMs, toleranceMs = 250, minSilenceMs = 400 }) {
  const silences = normalizeSegments(reference, durationMs).filter((s) => s.symbol === 'N' && s.endMs - s.startMs >= minSilenceMs);
  const silentMs = silences.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
  let silentHit = 0;
  for (const piece of overlapPieces(silences, normalizeSegments(estimate, durationMs), durationMs)) {
    if (piece.reference === 'N' && silences.some((s) => piece.startMs >= s.startMs && piece.endMs <= s.endMs)
      && mapLabel(piece.estimate, 'majmin') === 'N') silentHit += piece.endMs - piece.startMs;
  }
  return {
    wcsr: {
      root: wcsr(reference, estimate, { durationMs, vocabulary: 'root' }),
      majmin: wcsr(reference, estimate, { durationMs, vocabulary: 'majmin' }),
      majminInv: wcsr(reference, estimate, { durationMs, vocabulary: 'majmin_inv' }),
      sevenths: wcsr(reference, estimate, { durationMs, vocabulary: 'sevenths' }),
    },
    ...segmentationScores(reference, estimate, { durationMs }),
    boundary: boundaryScores(reference, estimate, { durationMs, toleranceMs }),
    changesPerMinute: { reference: changesPerMinute(mergeRuns(normalizeSegments(reference, durationMs), null), durationMs), estimate: changesPerMinute(estimate, durationMs) },
    noChordRecall: silentMs ? silentHit / silentMs : null,
  };
}
