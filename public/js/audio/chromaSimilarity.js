/** Cosine similarity between normalized pitch-class profiles, as an orientation score. */
export function compareChroma(reference, observed) {
  if (!Array.isArray(reference) || !Array.isArray(observed) || reference.length !== 12 || observed.length !== 12
    || reference.some((value) => !Number.isFinite(value) || value < 0)
    || observed.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError('Ambos cromas deben contener 12 energías finitas y no negativas.');
  }
  const referenceNorm = Math.hypot(...reference);
  const observedNorm = Math.hypot(...observed);
  if (referenceNorm < 1e-9 || observedNorm < 1e-9) return null;
  const dot = reference.reduce((sum, value, index) => sum + value * observed[index], 0);
  return Math.max(0, Math.min(1, dot / (referenceNorm * observedNorm)));
}
