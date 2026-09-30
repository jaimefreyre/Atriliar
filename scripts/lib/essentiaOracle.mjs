// Cross-check of the JS harmony front end against Essentia's own
// LogSpectrum + NNLSChroma, both without the NNLS step (the vendored build
// returns zeros with useNNLS=true, and NaN tuning unless it is passed in).
// Slow on purpose: Essentia's LogSpectrum takes ~0.25 s per 16384 frame.

import { computeHarmonyFrames } from '../../public/js/harmony/chromaFrontEnd.js';

const A_TO_C = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let pc = 0; pc < 12; pc++) { dot += a[pc] * b[pc]; na += a[pc] * a[pc]; nb += b[pc] * b[pc]; }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : null;
}

/** @returns {{frames:number, median:number, p10:number, min:number, essentiaSeconds:number, jsSeconds:number}} */
export function compareFrontEndWithEssentia(essentia, { pcm, sampleRate = 44100, frameSize = 16384, hopSize = 2048 }) {
  const started = performance.now();
  const spectra = new essentia.module.VectorVectorFloat();
  let count = 0;
  for (let center = 0; center < pcm.length; center += hopSize, count++) {
    const frame = new Float32Array(frameSize);
    for (let n = 0; n < frameSize; n++) { const index = center - frameSize / 2 + n; frame[n] = index >= 0 && index < pcm.length ? pcm[index] : 0; }
    const vector = essentia.arrayToVector(frame);
    const windowed = essentia.Windowing(vector, true, frameSize, 'hann', 0, true);
    const spectrum = essentia.Spectrum(windowed.frame, frameSize);
    spectra.push_back(essentia.LogSpectrum(spectrum.spectrum, 3, frameSize, 0, sampleRate).logFreqSpectrum);
    vector.delete(); windowed.frame.delete(); spectrum.spectrum.delete();
  }
  const zeros = () => essentia.arrayToVector(new Float32Array(count));
  const result = essentia.NNLSChroma(spectra, zeros(), zeros(), 'none', frameSize, sampleRate, 0.7, 1, 'global', false);
  const essentiaSeconds = (performance.now() - started) / 1000;
  const jsStarted = performance.now();
  const ours = computeHarmonyFrames(pcm, sampleRate, { frameSize, hopSize, useNNLS: false });
  const jsSeconds = (performance.now() - jsStarted) / 1000;
  const similarities = [];
  for (let index = 0; index < Math.min(result.chromagram.size(), ours.count); index++) {
    const theirs = Array.from(essentia.vectorToArray(result.chromagram.get(index)));
    const mine = Array.from(ours.treble.subarray(index * 12, index * 12 + 12));
    const value = cosine(mine, A_TO_C.map((pc) => theirs[pc]));
    if (value !== null) similarities.push(value);
  }
  spectra.delete?.();
  similarities.sort((a, b) => a - b);
  const quantile = (q) => similarities[Math.floor(q * (similarities.length - 1))];
  return { frames: similarities.length, median: quantile(0.5), p10: quantile(0.1), min: similarities[0], essentiaSeconds, jsSeconds };
}
