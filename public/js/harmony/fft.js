// Real-input FFT (radix-2, computed through an N/2 complex transform) and the
// Hann window. Pure and allocation-free per frame, so the harmony front end
// runs the same way in a Worker, in the live path and in Node tests.

function assertPowerOfTwo(size) {
  if (!Number.isInteger(size) || size < 4 || (size & (size - 1)) !== 0) {
    throw new RangeError(`El tamaño de FFT debe ser potencia de 2 (≥ 4): ${size}`);
  }
}

/** Symmetric Hann window (same formula as Essentia's `hann`, not normalized). */
export function hannWindow(size) {
  const window = new Float32Array(size);
  for (let n = 0; n < size; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
  return window;
}

/**
 * @param {number} size frame length (power of two)
 * @returns {{size:number, bins:number, magnitude(frame: ArrayLike<number>, out?: Float32Array): Float32Array}}
 *   magnitude() returns |X[k]| for k = 0..size/2 (size/2 + 1 bins).
 */
export function createRealFFT(size) {
  assertPowerOfTwo(size);
  const half = size / 2;
  const bits = Math.log2(half);
  const reverse = new Uint32Array(half);
  for (let index = 0; index < half; index++) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < bits; bit++) { reversed = (reversed << 1) | (value & 1); value >>= 1; }
    reverse[index] = reversed;
  }
  // Twiddles for the N/2 complex transform and for the final real split.
  const cosHalf = new Float64Array(half / 2 || 1);
  const sinHalf = new Float64Array(half / 2 || 1);
  for (let k = 0; k < half / 2; k++) {
    cosHalf[k] = Math.cos((2 * Math.PI * k) / half);
    sinHalf[k] = -Math.sin((2 * Math.PI * k) / half);
  }
  const cosFull = new Float64Array(half + 1);
  const sinFull = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    cosFull[k] = Math.cos((2 * Math.PI * k) / size);
    sinFull[k] = -Math.sin((2 * Math.PI * k) / size);
  }
  const re = new Float64Array(half);
  const im = new Float64Array(half);

  function complexFFT() {
    for (let blockSize = 2; blockSize <= half; blockSize <<= 1) {
      const halfBlock = blockSize >> 1;
      const step = half / blockSize;
      for (let start = 0; start < half; start += blockSize) {
        for (let j = 0; j < halfBlock; j++) {
          const wr = cosHalf[j * step];
          const wi = sinHalf[j * step];
          const a = start + j;
          const b = a + halfBlock;
          const tr = wr * re[b] - wi * im[b];
          const ti = wr * im[b] + wi * re[b];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  function magnitude(frame, out = new Float32Array(half + 1)) {
    if (frame.length !== size) throw new RangeError(`Se esperaban ${size} muestras y llegaron ${frame.length}.`);
    for (let n = 0; n < half; n++) {
      const target = reverse[n];
      re[target] = frame[2 * n];
      im[target] = frame[2 * n + 1];
    }
    complexFFT();
    for (let k = 0; k <= half; k++) {
      const a = k % half;
      const b = (half - k) % half;
      const zr = re[a], zi = im[a];
      const nr = re[b], ni = -im[b];
      const er = (zr + nr) / 2, ei = (zi + ni) / 2;
      // O = (Z[k] - conj(Z[N/2-k])) / (2i)
      const or = (zi - ni) / 2, oi = -(zr - nr) / 2;
      const xr = er + cosFull[k] * or - sinFull[k] * oi;
      const xi = ei + cosFull[k] * oi + sinFull[k] * or;
      out[k] = Math.hypot(xr, xi);
    }
    return out;
  }

  return { size, bins: half + 1, magnitude };
}
