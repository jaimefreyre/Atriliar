import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateLegacySong } from '../../public/js/data/legacyImporter.js';
import { detectSongFormat } from '../../public/js/data/songValidator.js';

function readJsonFile(relativePath) {
  let text = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM en all-verses.json
  return JSON.parse(text);
}

const FIXTURES = [
  '../../Calamaro estadio azteca.json',
  '../../CalamaroEstadioTabs.json',
  '../../Parte Del Aire - Fito.json',
  '../../test charly.json',
  '../../vos tambien.json',
  '../../public/fixtures/songs/all-verses.json',
];

test('los 6 documentos legacy se detectan como legacy, no v2', () => {
  for (const path of FIXTURES) {
    const raw = readJsonFile(path);
    assert.equal(detectSongFormat(raw), 'legacy', path);
  }
});

test('los 6 documentos legacy migran a un v2 válido sin tocar el original', () => {
  for (const path of FIXTURES) {
    const raw = readJsonFile(path);
    const rawCopy = JSON.parse(JSON.stringify(raw));
    const { document } = migrateLegacySong(raw);
    assert.deepEqual(raw, rawCopy, `migrateLegacySong no debe mutar el original (${path})`);
    assert.equal(document.schemaVersion, 2);
    assert.equal(document.timing.status, 'estimated');
    assert.equal(document.audio, null);
  }
});

test('las dos variantes de Estadio Azteca comparten id tras migrar (colisión real, a resolver en el import)', () => {
  const a = migrateLegacySong(readJsonFile('../../Calamaro estadio azteca.json'));
  const b = migrateLegacySong(readJsonFile('../../CalamaroEstadioTabs.json'));
  assert.equal(a.document.id, 'andres-calamaro-estadio-azteca');
  assert.equal(b.document.id, 'andres-calamaro-estadio-azteca');
});

test('CalamaroEstadioTabs.json trae tabs legacy que se reportan sin convertir automáticamente', () => {
  const { document, report, warnings } = migrateLegacySong(readJsonFile('../../CalamaroEstadioTabs.json'));
  assert.equal(document.tabs.length, 0);
  assert.ok(report.unconvertedTabs.length > 0);
  assert.ok(warnings.some(w => w.includes('tablatura legacy')));
});

test('test charly.json tiene un acorde con position === lyrics.length; migra sin ancla en vez de truncar', () => {
  const { document, report } = migrateLegacySong(readJsonFile('../../test charly.json'));
  assert.ok(report.droppedAnchors.length > 0);
  const chordsWithoutAnchor = document.chords.filter(c => c.anchor === null);
  assert.ok(chordsWithoutAnchor.length > 0);
});

test('all-verses.json (con modulación C -> F y BOM) migra preservando la modulación', () => {
  const { document } = migrateLegacySong(readJsonFile('../../public/fixtures/songs/all-verses.json'));
  const modulated = document.sections.filter(s => s.key !== null);
  assert.ok(modulated.length > 0, 'debe haber al menos una sección con key explícita (modulación)');
});

test('sin bpm legacy ni bpmOverride, migrateLegacySong lanza en vez de inventar un valor', () => {
  const raw = readJsonFile('../../test charly.json');
  raw.metadata.bpm = undefined;
  assert.throws(() => migrateLegacySong(raw));
  assert.doesNotThrow(() => migrateLegacySong(raw, { bpmOverride: 100 }));
});
