#!/usr/bin/env node
'use strict';

/**
 * Compiles contracts/song-v2.schema.json into a self-contained ESM module
 * (public/js/generated/validateSongV2.js) with Ajv's standalone codegen,
 * then bundles it with esbuild so it has zero runtime imports/requires.
 * No CDN, no Ajv dependency shipped to the browser at runtime — only the
 * generated output is served. Re-run after any schema change:
 *   node scripts/build-validator.cjs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv2020 = require('ajv/dist/2020').default;
const standaloneCode = require('ajv/dist/standalone').default;
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'contracts', 'song-v2.schema.json');
const OUT_DIR = path.join(ROOT, 'public', 'js', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'validateSongV2.js');
const TMP_FILE = path.join(OUT_DIR, '._validateSongV2.tmp.mjs');

// The schema only ever needs "uri" and "date-time". Hand-rolled as RegExp
// (not functions) so Ajv can inline them as literals in standalone code —
// a function-based custom format would need a runtime require() that a
// plain <script type="module"> can't resolve without a bundler present at
// show time, which the spec explicitly rules out.
const URI_FORMAT = /^[a-z][a-z0-9+.-]*:\S*$/i;
const DATE_TIME_FORMAT = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d{1,9})?([Zz]|[+-]\d{2}:\d{2})$/;

function main() {
  const schemaSource = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(schemaSource);

  const ajv = new Ajv2020({
    code: { source: true, esm: true },
    allErrors: true,
    strict: true,
  });
  ajv.addFormat('uri', URI_FORMAT);
  ajv.addFormat('date-time', DATE_TIME_FORMAT);

  const validate = ajv.compile(schema);
  const moduleCode = standaloneCode(ajv, validate);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(TMP_FILE, moduleCode, 'utf8');

  let bundled;
  try {
    const result = esbuild.buildSync({
      entryPoints: [TMP_FILE],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      absWorkingDir: ROOT,
      write: false,
    });
    bundled = result.outputFiles[0].text;
  } finally {
    fs.unlinkSync(TMP_FILE);
  }

  const schemaHash = crypto.createHash('sha256').update(schemaSource).digest('hex').slice(0, 16);
  const header =
    '// GENERATED FILE — do not edit by hand.\n' +
    `// Source: contracts/song-v2.schema.json (sha256:${schemaHash})\n` +
    '// Regenerate: node scripts/build-validator.cjs\n' +
    '// Exports a default function: validate(document) -> boolean, with errors on validate.errors.\n';
  fs.writeFileSync(OUT_FILE, header + bundled, 'utf8');

  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${bundled.length} bytes) from schema hash ${schemaHash}`);
}

main();
