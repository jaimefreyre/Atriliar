/**
 * Turn analyzer suggestions into ordered, non-overlapping chord intervals.
 * Boundaries are clamped to the file, missing symbols stay as gaps, and equal
 * adjacent guesses are merged. No section names are inferred from audio.
 */
export function segmentChordSuggestions(suggestions, durationMs) {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new RangeError('Duración inválida.');
  const valid = suggestions.filter((item) => item && typeof item.symbol === 'string' && item.symbol.trim()
    && Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs > item.startMs)
    .map((item) => ({ ...item, startMs: Math.max(0, Math.min(durationMs, Math.round(item.startMs))),
      endMs: Math.max(0, Math.min(durationMs, Math.round(item.endMs))) }))
    .filter((item) => item.endMs > item.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const resolved = [];
  for (let i = 0; i < valid.length; i++) {
    const current = valid[i];
    const next = valid[i + 1];
    const endMs = next ? Math.min(current.endMs, next.startMs) : current.endMs;
    if (endMs <= current.startMs) continue;
    const last = resolved.at(-1);
    if (last && last.symbol === current.symbol && last.endMs === current.startMs) {
      last.endMs = endMs;
      last.confidence = Math.min(last.confidence ?? 1, current.confidence ?? 1);
    } else {
      resolved.push({ symbol: current.symbol, startMs: current.startMs, endMs,
        confidence: Number.isFinite(current.confidence) ? current.confidence : null });
    }
  }
  return resolved;
}

/** The only safe automatic section until arrangement boundaries are reviewed. */
export function createUnclassifiedSections(durationMs) {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new RangeError('Duración inválida.');
  return [{ id: 'section-audio-draft', type: 'instrumental', label: 'BORRADOR · ESTRUCTURA SIN CLASIFICAR',
    key: null, startMs: 0, endMs: durationMs }];
}
