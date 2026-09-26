/**
 * Greedy one-to-one nearest-neighbour match. A detected attack or target can
 * participate in at most one match, so repeats and the same target cannot
 * inflate the reported accuracy.
 * @param {number[]} detectedMs
 * @param {number[]} expectedMs
 * @param {{toleranceMs?:number}} [options]
 */
export function matchOnsets(detectedMs, expectedMs, { toleranceMs = 100, throughMs = -Infinity } = {}) {
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) throw new RangeError('Tolerancia inválida.');
  const detected = detectedMs.filter(Number.isFinite).map((timeMs, originalIndex) => ({ timeMs, originalIndex }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const expected = expectedMs.filter(Number.isFinite).map((timeMs, originalIndex) => ({ timeMs, originalIndex }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const matches = [];
  const falsePositives = [];
  let expectedIndex = 0;
  for (const hit of detected) {
    while (expectedIndex < expected.length && expected[expectedIndex].timeMs < hit.timeMs - toleranceMs) expectedIndex++;
    const first = expected[expectedIndex];
    const second = expected[expectedIndex + 1];
    const firstDistance = first ? Math.abs(hit.timeMs - first.timeMs) : Infinity;
    const secondDistance = second ? Math.abs(hit.timeMs - second.timeMs) : Infinity;
    const selectedIndex = firstDistance <= secondDistance ? expectedIndex : expectedIndex + 1;
    const selected = firstDistance <= secondDistance ? first : second;
    const selectedDistance = Math.min(firstDistance, secondDistance);
    if (!selected || selectedDistance > toleranceMs) { falsePositives.push(hit.timeMs); continue; }
    // If the second expected beat is a better fit, the first can no longer
    // match a later detection because timestamps are processed in order.
    if (selectedIndex > expectedIndex) expectedIndex = selectedIndex;
    matches.push({ detectedMs: hit.timeMs, expectedMs: selected.timeMs,
      signedErrorMs: hit.timeMs - selected.timeMs });
    expectedIndex = selectedIndex + 1;
  }

  // Expected hits skipped while looking ahead are misses; later targets have
  // not happened yet and are not included in this provisional report.
  const matchedTimes = new Set(matches.map((match) => match.expectedMs));
  const reachedTime = Math.max(detected.at(-1)?.timeMs ?? -Infinity, Number.isFinite(throughMs) ? throughMs : -Infinity);
  const missed = expected.filter(({ timeMs }) => timeMs <= reachedTime && !matchedTimes.has(timeMs))
    .map(({ timeMs }) => timeMs);
  const meanAbsoluteErrorMs = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + Math.abs(match.signedErrorMs), 0) / matches.length)
    : null;
  const meanSignedErrorMs = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + match.signedErrorMs, 0) / matches.length)
    : null;
  const precision = detected.length ? matches.length / detected.length : null;
  const recall = expected.length ? matches.length / expected.length : null;
  const f1 = precision === null || recall === null ? null
    : precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);

  return { matches, falsePositives, missed, precision, recall, f1, meanAbsoluteErrorMs, meanSignedErrorMs,
    detectedCount: detected.length, expectedCount: expected.length };
}

/** @param {number[]} sortedExpected @param {number} positionMs */
export function findNearestExpected(sortedExpected, positionMs) {
  if (!sortedExpected.length || !Number.isFinite(positionMs)) return null;
  let lo = 0; let hi = sortedExpected.length - 1; let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedExpected[mid] <= positionMs) { candidate = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const previous = candidate >= 0 ? sortedExpected[candidate] : null;
  const next = candidate + 1 < sortedExpected.length ? sortedExpected[candidate + 1] : null;
  if (previous === null) return next;
  if (next === null) return previous;
  return positionMs - previous <= next - positionMs ? previous : next;
}
