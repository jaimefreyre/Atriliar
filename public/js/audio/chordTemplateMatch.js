import { getChordTones } from '../music/harmony.js';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];
const CANDIDATES = ROOTS.flatMap((root) => QUALITIES.map((quality) => `${root}${quality}`));

/**
 * Compare a 12-bin chroma vector with known chord-tone templates. This returns
 * candidate triads/sevenths only; it does not infer inversions or a bassline.
 * @param {number[]} chroma non-negative pitch-class energy in C,C#,D,... order
 * @param {{minScore?:number,minMargin?:number}} [options]
 */
export function matchChordTemplate(chroma, { minScore = 0.48, minMargin = 0.04 } = {}) {
  if (!Array.isArray(chroma) && !ArrayBuffer.isView(chroma)) throw new TypeError('Croma debe ser un vector de 12 valores.');
  if (chroma.length !== 12 || [...chroma].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Croma debe contener exactamente 12 valores finitos no negativos.');
  }
  const magnitude = Math.hypot(...chroma);
  if (magnitude === 0) return { symbol: null, score: 0, margin: 0, accepted: false };
  const normalized = [...chroma].map((value) => value / magnitude);
  const ranked = CANDIDATES.map((symbol) => {
    const tones = getChordTones(symbol).tones;
    const templateLength = Math.sqrt(tones.length);
    const score = tones.reduce((sum, tone) => sum + normalized[tone], 0) / templateLength;
    return { symbol, score };
  }).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const best = ranked[0];
  const margin = best.score - (ranked[1]?.score || 0);
  return { symbol: best.symbol, score: best.score, margin,
    alternatives: ranked.slice(0, 6).map(({ symbol, score }) => ({ symbol, score })),
    accepted: best.score >= minScore && margin >= minMargin };
}
