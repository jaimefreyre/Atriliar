/** Extend an analysis beat to the adjacent same-chord passage, capped for quick audition. */
export function getAuditionRange(segments, selectedIndex, { maxDurationMs = 6000 } = {}) {
  if (!Array.isArray(segments) || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= segments.length) return null;
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) throw new RangeError('La duración de escucha debe ser positiva.');
  const selected = segments[selectedIndex];
  if (!Number.isFinite(selected?.startMs) || !Number.isFinite(selected?.endMs) || selected.endMs <= selected.startMs) return null;
  const symbol = selected.selectedSymbol || selected.symbol;
  let endMs = selected.endMs;
  const capMs = selected.startMs + Math.max(maxDurationMs, endMs - selected.startMs);
  if (symbol) {
    for (let index = selectedIndex + 1; index < segments.length; index++) {
      const next = segments[index];
      if (next.startMs > endMs + 40 || (next.selectedSymbol || next.symbol) !== symbol || next.endMs > capMs) break;
      endMs = next.endMs;
    }
  }
  return { startMs: selected.startMs, endMs, symbol: symbol || null };
}
