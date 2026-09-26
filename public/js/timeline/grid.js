/** @typedef {{numerator:number, denominator:number}} TimeSignature */

/** Duration of one notated beat unit (denominator note), in milliseconds. */
export function getMeterUnitMs(bpm, denominator) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM debe ser positivo.');
  if (!Number.isInteger(denominator) || denominator <= 0) throw new RangeError('Denominador de compás inválido.');
  return 60_000 / bpm * 4 / denominator;
}

/** Quarter-note BPM; 6/8 therefore contains six eighth-note units = 3 quarters. */
export function getBarDurationMs(bpm, timeSignature) {
  if (!timeSignature || !Number.isInteger(timeSignature.numerator) || timeSignature.numerator < 1) {
    throw new RangeError('Numerador de compás inválido.');
  }
  return getMeterUnitMs(bpm, timeSignature.denominator) * timeSignature.numerator;
}

/** Calculate each boundary from the origin to avoid accumulating rounded bars. */
export function getGridTimes({ bpm, timeSignature, durationMs, subdivision = 1, startMs = 0 }) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('Duración inválida.');
  if (!Number.isInteger(subdivision) || subdivision < 1 || subdivision > 32) throw new RangeError('Subdivisión inválida.');
  if (!timeSignature || !Number.isInteger(timeSignature.denominator) || timeSignature.denominator <= 0) {
    throw new RangeError('Denominador de compás inválido.');
  }
  const quarterMs = 60_000 / bpm;
  const totalUnits = timeSignature.numerator * (4 / timeSignature.denominator);
  const gridStepMs = quarterMs / subdivision;
  const times = [];
  for (let index = 0; ; index++) {
    const boundary = Math.round(startMs + index * gridStepMs);
    if (boundary > durationMs) break;
    times.push(boundary);
  }
  return { times, gridStepMs, totalUnits, barDurationMs: getBarDurationMs(bpm, timeSignature) };
}
