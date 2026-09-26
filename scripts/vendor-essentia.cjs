'use strict';

// Copies only the ESM core and its WebAssembly backend for browser Workers.
// In essentia.js 0.1.3 the ESM WASM binary is embedded in the glue module.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules', 'essentia.js');
const target = path.join(root, 'public', 'vendor', 'essentia');
const files = ['dist/essentia.js-core.es.js', 'dist/essentia-wasm.es.js', 'LICENSE'];

fs.mkdirSync(target, { recursive: true });
for (const relative of files) fs.copyFileSync(path.join(source, relative), path.join(target, path.basename(relative)));
fs.writeFileSync(path.join(target, 'NOTICE.txt'),
  'Essentia.js 0.1.3\nSource: https://github.com/MTG/essentia.js\nLicense: AGPL-3.0 (see LICENSE).\nThe ESM WebAssembly build contains its binary in the JavaScript glue module.\nCopied by npm run vendor:essentia.\n', 'utf8');
console.log(`Copied Essentia.js 0.1.3 browser Worker artifacts to ${path.relative(root, target)}`);
