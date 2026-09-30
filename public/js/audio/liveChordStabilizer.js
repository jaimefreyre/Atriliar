import { matchChordTemplate } from './chordTemplateMatch.js';

/** Smooth chroma and require a confident chord proposal to persist before switching. */
export function createLiveChordStabilizer({ alpha = 0.26, minScore = 0.4, minMargin = 0.025, confirmMs = 340 } = {}) {
  let smoothed = Array(12).fill(0);
  let pendingSymbol = null;
  let pendingSince = null;
  let confirmed = null;

  function update(chroma, timestampMs = performance.now(), evidence = {}) {
    if ((!Array.isArray(chroma) && !ArrayBuffer.isView(chroma)) || chroma.length !== 12 || [...chroma].some((value) => !Number.isFinite(value) || value < 0)) {
      throw new RangeError('Croma debe contener exactamente 12 valores finitos no negativos.');
    }
    smoothed = smoothed.map((previous, index) => previous * (1 - alpha) + Number(chroma[index]) * alpha);
    const estimate = matchChordTemplate(smoothed, { minScore, minMargin,
      bassPitchClass: evidence.bassPitchClass, fundamentalPitchClass: evidence.fundamentalPitchClass });
    if (estimate.accepted) {
      if (estimate.symbol !== pendingSymbol) {
        pendingSymbol = estimate.symbol;
        pendingSince = timestampMs;
      }
      if (timestampMs - pendingSince >= confirmMs) {
        confirmed = { symbol: pendingSymbol, score: estimate.score, margin: estimate.margin };
        pendingSymbol = null;
        pendingSince = null;
      }
    } else {
      pendingSymbol = null;
      pendingSince = null;
    }
    return {
      confirmed: confirmed ? { ...confirmed } : null,
      proposal: estimate.accepted ? { symbol: estimate.symbol, score: estimate.score, margin: estimate.margin } : null,
      pendingMs: pendingSince === null ? 0 : Math.max(0, timestampMs - pendingSince),
      chroma: [...smoothed],
      evidence: { ...evidence },
      estimate,
    };
  }

  function reset() {
    smoothed = Array(12).fill(0);
    pendingSymbol = null;
    pendingSince = null;
    confirmed = null;
  }

  return { update, reset };
}
