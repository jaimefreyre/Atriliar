#!/usr/bin/env node
/**
 * Regenerates the precache list and cache name inside public/sw.js from the
 * files actually present in public/. A hand-kept list drifted before (a
 * missing module made the whole app fail to load offline), and the service
 * worker's install aborts if any listed file is missing.
 *
 *   node scripts/build-shell-manifest.cjs          rewrite public/sw.js
 *   node scripts/build-shell-manifest.cjs --check  exit 1 if it is stale
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SW_PATH = path.join(PUBLIC_DIR, 'sw.js');
const BEGIN = '// @generated-shell-begin';
const END = '// @generated-shell-end';
const SHELL_DIRS = ['css', 'js', 'fixtures'];
const SHELL_EXTENSIONS = new Set(['.js', '.css', '.json']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** URL paths the app shell needs offline, sorted; '/' stands for index.html. */
function collectShellFiles(publicDir = PUBLIC_DIR) {
  const files = SHELL_DIRS.flatMap((dir) => walk(path.join(publicDir, dir)))
    .filter((file) => SHELL_EXTENSIONS.has(path.extname(file)))
    .map((file) => `/${path.relative(publicDir, file).split(path.sep).join('/')}`)
    .sort();
  return ['/', ...files];
}

function diskPathFor(urlPath, publicDir = PUBLIC_DIR) {
  return path.join(publicDir, urlPath === '/' ? 'index.html' : urlPath.slice(1));
}

/** Content hash, so any change to a shell file installs a fresh snapshot. */
function computeShellVersion(files, publicDir = PUBLIC_DIR) {
  const hash = crypto.createHash('sha1');
  for (const urlPath of files) {
    hash.update(urlPath);
    hash.update('\0');
    hash.update(fs.readFileSync(diskPathFor(urlPath, publicDir)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function renderShellBlock(files, version) {
  return [
    `${BEGIN} (npm run build:shell; no editar a mano)`,
    `const SHELL_CACHE = 'stageprompter-shell-${version}';`,
    'const SHELL = [',
    ...files.map((file) => `  '${file}',`),
    '];',
    END,
  ].join('\n');
}

function buildServiceWorkerSource(currentSource, publicDir = PUBLIC_DIR) {
  const start = currentSource.indexOf(BEGIN);
  const end = currentSource.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`public/sw.js no tiene los marcadores ${BEGIN} / ${END}.`);
  }
  const files = collectShellFiles(publicDir);
  const block = renderShellBlock(files, computeShellVersion(files, publicDir));
  return currentSource.slice(0, start) + block + currentSource.slice(end + END.length);
}

function main() {
  const check = process.argv.includes('--check');
  const current = fs.readFileSync(SW_PATH, 'utf8');
  const next = buildServiceWorkerSource(current);
  if (check) {
    if (next !== current) {
      console.error('public/sw.js está desactualizado. Corré: npm run build:shell');
      process.exit(1);
    }
    console.log('public/sw.js al día.');
    return;
  }
  if (next !== current) fs.writeFileSync(SW_PATH, next);
  console.log(`public/sw.js: ${collectShellFiles().length} archivos en el shell.`);
}

if (require.main === module) main();

module.exports = { collectShellFiles, computeShellVersion, renderShellBlock, buildServiceWorkerSource, diskPathFor, SW_PATH, PUBLIC_DIR };
