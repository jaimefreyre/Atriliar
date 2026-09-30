import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manifest = require('../../scripts/build-shell-manifest.cjs');

test('public/sw.js precachea exactamente los archivos del shell (npm run build:shell)', () => {
  const current = fs.readFileSync(manifest.SW_PATH, 'utf8');
  assert.equal(current, manifest.buildServiceWorkerSource(current),
    'public/sw.js está desactualizado: corré `npm run build:shell` y commiteá el resultado.');
});

test('el shell incluye todo módulo de la app y excluye depuración y herramientas pesadas', () => {
  const files = manifest.collectShellFiles();
  assert.ok(files.includes('/'));
  assert.ok(files.includes('/js/music/chromaMatch.js'), 'faltó un módulo importado por el laboratorio');
  assert.ok(files.includes('/js/generated/validateSongV2.js'));
  assert.ok(files.every((file) => !file.startsWith('/debug/') && !file.startsWith('/vendor/')));
  assert.ok(!files.includes('/sw.js') && !files.includes('/package.json'));
  for (const file of files) assert.ok(fs.existsSync(manifest.diskPathFor(file)), `no existe ${file}`);
});

test('todo import relativo de public/js apunta a un archivo que existe', () => {
  const jsRoot = path.join(manifest.PUBLIC_DIR, 'js');
  const pending = [jsRoot];
  const broken = [];
  const importPattern = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url/g;
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { pending.push(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] || match[2] || match[3];
        if (!fs.existsSync(path.resolve(path.dirname(full), specifier))) {
          broken.push(`${path.relative(manifest.PUBLIC_DIR, full)} → ${specifier}`);
        }
      }
    }
  }
  assert.deepEqual(broken, []);
});
