import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSongV2 } from '../../public/js/data/songValidator.js';

function loadDemo() {
  const raw = readFileSync(new URL('../../docs/spec-v2/contratos/demo-original.song.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

// Casos mínimos de docs/spec-v2/contratos/CONTRATO-DATOS.md "Tipado y casos de aceptación".

test('la demo oficial pasa validateSongV2 sin errores', () => {
  const demo = loadDemo();
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('un borrador autoanalizado se mantiene en v2 como estimado', () => {
  const draft = loadDemo();
  draft.timing = { status: 'estimated', method: 'auto-analyzed', notes: 'Estimación inicial; requiere revisión.' };
  const { valid, errors } = validateSongV2(draft);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('un campo extra se rechaza', () => {
  const demo = loadDemo();
  demo.notAField = true;
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.instancePath === '')); // Ajv usa JSON Pointer: "" = raíz del documento
});

test('BPM no numérico se rechaza con ruta exacta', () => {
  const demo = loadDemo();
  demo.metadata.bpm = 'fast';
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.instancePath === '/metadata/bpm'));
});

test('un ancla huérfana se rechaza', () => {
  const demo = loadDemo();
  demo.chords[2].anchor = { lineId: 'no-existe', charOffset: 0 };
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.instancePath.includes('anchor/lineId')));
});

test('dos acordes solapados se rechazan', () => {
  const demo = loadDemo();
  demo.chords[1].endMs = demo.chords[1].startMs + 5000; // invade chord-03
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});

test('scale.id desconocido exige corrección', () => {
  const demo = loadDemo();
  demo.chords[0].scale = { root: 'C', id: 'no-tal-escala' };
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.instancePath.includes('scale/id')));
});

test('un intervalo que termina después de la canción se rechaza', () => {
  const demo = loadDemo();
  demo.sections.at(-1).endMs = demo.durationMs + 1000;
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});

test('una fuente con fecha inválida se rechaza', () => {
  const demo = loadDemo();
  demo.sources = [{ url: 'https://example.com', title: '', retrievedAt: '2026-01-01' }];
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});

test('un offset de audio negativo se rechaza', () => {
  const demo = loadDemo();
  demo.audio = { assetId: 'asset-1', offsetMs: -10 };
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});

test('un token que parte un par subrogado (emoji) se rechaza', () => {
  const demo = loadDemo();
  const line = demo.lines[0];
  line.text = 'Sol \u{1F3B8} hoy'; // el emoji ocupa el intervalo UTF-16 [4,6)
  line.tokens = [{ text: line.text.slice(4, 5), startMs: line.startMs, endMs: line.startMs + 100, charStart: 4, charEnd: 5 }];
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});

test('bassNote que no concuerda con el bajo del símbolo slash se rechaza', () => {
  const demo = loadDemo();
  demo.chords[0].symbol = 'C/E';
  demo.chords[0].bassNote = 'G';
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.instancePath.includes('bassNote')));
});

test('bassNote enarmónico correcto para un símbolo slash se acepta', () => {
  const demo = loadDemo();
  demo.chords[0].symbol = 'C/D#';
  demo.chords[0].bassNote = 'Eb'; // mismo pitch class que D#
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('un documento instrumental (sin líneas, acordes y secciones válidos) se acepta', () => {
  const demo = loadDemo();
  demo.lines = [];
  demo.chords = demo.chords.map(c => ({ ...c, anchor: null }));
  const { valid, errors } = validateSongV2(demo);
  assert.equal(valid, true, JSON.stringify(errors));
});

test('un hueco entre secciones (partición incompleta) se rechaza', () => {
  const demo = loadDemo();
  demo.sections[1].startMs += 100; // abre un hueco justo después de section-intro
  const { valid } = validateSongV2(demo);
  assert.equal(valid, false);
});
