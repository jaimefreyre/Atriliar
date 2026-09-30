// Load the vendored Essentia.js (the same files the browser worker imports)
// in Node, for the evaluation harness. The Emscripten glue detects Node and
// reaches for CommonJS `require` and `__dirname`, which ES modules lack.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const VENDOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/vendor/essentia');
let instance = null;

export async function loadEssentiaNode() {
  if (instance) return instance;
  globalThis.require ??= createRequire(import.meta.url);
  globalThis.__dirname ??= VENDOR_DIR;
  const [core, glue] = await Promise.all([
    import(pathToFileURL(path.join(VENDOR_DIR, 'essentia.js-core.es.js')).href),
    import(pathToFileURL(path.join(VENDOR_DIR, 'essentia-wasm.es.js')).href),
  ]);
  instance = new core.default(glue.EssentiaWASM);
  return instance;
}
