import { analyzeAudio } from './analysisPipeline.js';

// Thin Worker adapter: loads the vendored Essentia and runs the shared
// analysis pipeline. Cancelling means terminating the Worker.
//   → {type:'init'} | {type:'analyse', pcm, sampleRate, sensitivity?, constraints?}
//   ← ready | progress {stage, fraction} | warning {message} | analysis {...} | error {message}

let instance = null;

async function loadEssentia() {
  if (instance) return instance;
  // Keep both substantial modules out of the normal app import graph.
  const [core, wasmGlue] = await Promise.all([
    import('../../vendor/essentia/essentia.js-core.es.js'),
    import('../../vendor/essentia/essentia-wasm.es.js'),
  ]);
  // The ESM glue exports the already initialized Emscripten Module object.
  instance = new core.default(wasmGlue.EssentiaWASM);
  return instance;
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
    let lastStep = -1;
    const analysis = analyzeAudio(essentia, {
      pcm: data.pcm, sampleRate: data.sampleRate, sensitivity: data.sensitivity, constraints: data.constraints || [],
      onProgress: ({ stage, fraction }) => {
        const step = Math.floor(fraction * 20); // every 5 %
        if (step === lastStep) return;
        lastStep = step;
        self.postMessage({ type: 'progress', stage, fraction });
      },
      onWarning: (message) => self.postMessage({ type: 'warning', message }),
    });
    self.postMessage({ type: 'analysis', ...analysis });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.stack || error?.message || String(error) });
  }
};
