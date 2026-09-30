import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealFFT, hannWindow } from '../../public/js/harmony/fft.js';

function naiveMagnitudes(signal) {
  const size = signal.length;
  return Array.from({ length: size / 2 + 1 }, (_, k) => {
    let re = 0, im = 0;
    for (let n = 0; n < size; n++) {
      re += signal[n] * Math.cos((2 * Math.PI * k * n) / size);
      im -= signal[n] * Math.sin((2 * Math.PI * k * n) / size);
    }
    return Math.hypot(re, im);
  });
}

test('la FFT real coincide con una DFT directa', () => {
  const size = 64;
  const signal = Float32Array.from({ length: size }, (_, n) => Math.sin(n * 0.7) + 0.3 * Math.cos(n * 2.1) + (n % 5) * 0.01);
  const fast = createRealFFT(size).magnitude(signal);
  const slow = naiveMagnitudes(signal);
  slow.forEach((value, k) => assert.ok(Math.abs(value - fast[k]) < 1e-3, `bin ${k}: ${value} vs ${fast[k]}`));
});

test('un seno cae en el bin de su frecuencia', () => {
  const size = 4096;
  const sampleRate = 44100;
  const bin = 200;
  const frequency = (bin * sampleRate) / size;
  const window = hannWindow(size);
  const frame = Float32Array.from({ length: size }, (_, n) => Math.sin((2 * Math.PI * frequency * n) / sampleRate) * window[n]);
  const magnitudes = createRealFFT(size).magnitude(frame);
  const peak = magnitudes.indexOf(Math.max(...magnitudes));
  assert.equal(peak, bin);
});

test('rechaza tamaños que no son potencia de 2', () => {
  assert.throws(() => createRealFFT(1000), RangeError);
});
