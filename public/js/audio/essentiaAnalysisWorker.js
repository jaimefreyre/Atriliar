let instance = null;

async function loadEssentia() {
  if (instance) return instance;
  // Keep both substantial modules out of the normal app import graph.
  const [core, wasmGlue] = await Promise.all([
    import('../../vendor/essentia/essentia.js-core.es.js'),
    import('../../vendor/essentia/essentia-wasm.es.js'),
  ]);
  // The ESM glue exports the already initialized Emscripten Module object.
  const wasm = wasmGlue.EssentiaWASM;
  instance = new core.default(wasm);
  return instance;
}

function resampleTo44100(signal, sourceRate) {
  if (sourceRate === 44100) return signal;
  const targetLength = Math.round(signal.length * 44100 / sourceRate);
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / 44100;
  for (let i = 0; i < targetLength; i++) {
    const at = i * ratio;
    const left = Math.floor(at);
    const mix = at - left;
    const a = signal[Math.min(left, signal.length - 1)] || 0;
    const b = signal[Math.min(left + 1, signal.length - 1)] || 0;
    output[i] = a + (b - a) * mix;
  }
  return output;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const essentia = await loadEssentia();
      self.postMessage({ type: 'ready', version: essentia.version,
        rhythm: essentia.algorithmNames.includes('RhythmExtractor2013'),
        onsets: essentia.algorithmNames.includes('OnsetRate') });
      return;
    }
    if (data.type !== 'analyse') return;
    const essentia = await loadEssentia();
    const pcm44100 = resampleTo44100(data.pcm, data.sampleRate);
    const signal = essentia.arrayToVector(pcm44100);
    try {
      const rhythm = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40);
      const beats = Array.from(essentia.vectorToArray(rhythm.ticks), Number);
      let onsets = [];
      let onsetRate = 0;
      try {
        const onsetResult = essentia.OnsetRate(signal);
        onsets = Array.from(essentia.vectorToArray(onsetResult.onsets), Number);
        onsetRate = Number(onsetResult.onsetRate) || 0;
      } catch (error) {
        self.postMessage({ type: 'warning', message: `OnsetRate no disponible: ${error.message}` });
      }
      self.postMessage({ type: 'analysis', version: essentia.version, sampleRate: 44100,
        durationMs: Math.round(pcm44100.length / 44100 * 1000), bpm: Number(rhythm.bpm),
        rhythmConfidence: Number(rhythm.confidence) || 0, beats, onsets, onsetRate });
      rhythm.ticks?.delete?.(); rhythm.bpmIntervals?.delete?.(); rhythm.estimates?.delete?.();
    } finally {
      signal?.delete?.();
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
  }
};
