import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLineSegments } from '../../public/js/rendering/prompter.js';

function reconstruct(segments) {
  return segments.map((s) => s.text).join('');
}

test('sin acordes ni tokens: un único segmento con todo el texto', () => {
  const line = { id: 'l1', text: 'Hola mundo', tokens: [] };
  const segments = computeLineSegments(line, []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, 'Hola mundo');
  assert.equal(segments[0].chord, null);
  assert.equal(segments[0].tokenIdx, null);
});

test('dos acordes anclados en distintos offsets producen tres segmentos, cada uno con su acorde', () => {
  const line = { id: 'l1', text: 'Enciende la luz', tokens: [] };
  const chords = [
    { id: 'c1', anchor: { lineId: 'l1', charOffset: 0 }, symbol: 'C' },
    { id: 'c2', anchor: { lineId: 'l1', charOffset: 9 }, symbol: 'G' }, // offset de "la"
  ];
  const segments = computeLineSegments(line, chords);
  assert.equal(reconstruct(segments), line.text);
  assert.equal(segments[0].chord.symbol, 'C');
  assert.equal(segments[0].text, 'Enciende ');
  const segWithG = segments.find((s) => s.chord?.symbol === 'G');
  assert.ok(segWithG);
  assert.equal(segWithG.start, 9);
});

test('tokens sin acordes: los segmentos coinciden exactamente con los límites de cada token', () => {
  const line = {
    id: 'l1', text: 'Hola mundo',
    tokens: [
      { text: 'Hola', startMs: 0, endMs: 100, charStart: 0, charEnd: 4 },
      { text: 'mundo', startMs: 100, endMs: 200, charStart: 5, charEnd: 10 },
    ],
  };
  const segments = computeLineSegments(line, []);
  assert.equal(reconstruct(segments), line.text);
  // "Hola" (token 0), " " (sin token), "mundo" (token 1)
  assert.deepEqual(segments.map((s) => s.tokenIdx), [0, null, 1]);
  assert.equal(segments[1].text, ' ');
});

test('un acorde anclado a mitad de palabra parte el token en dos segmentos con el mismo tokenIdx', () => {
  const line = {
    id: 'l1', text: 'camino',
    tokens: [{ text: 'camino', startMs: 0, endMs: 100, charStart: 0, charEnd: 6 }],
  };
  const chords = [{ id: 'c1', anchor: { lineId: 'l1', charOffset: 3 }, symbol: 'Am' }]; // "cam|ino"
  const segments = computeLineSegments(line, chords);
  assert.equal(reconstruct(segments), 'camino');
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map((s) => s.tokenIdx), [0, 0]);
  assert.equal(segments[1].chord.symbol, 'Am');
  assert.equal(segments[0].text, 'cam');
  assert.equal(segments[1].text, 'ino');
});

test('un emoji (par subrogado) nunca queda partido entre segmentos', () => {
  const text = 'Sol \u{1F3B8} hoy'; // el emoji ocupa [4,6)
  const line = {
    id: 'l1', text,
    tokens: [
      { text: 'Sol', startMs: 0, endMs: 100, charStart: 0, charEnd: 3 },
      { text: text.slice(4, 6), startMs: 100, endMs: 200, charStart: 4, charEnd: 6 },
      { text: 'hoy', startMs: 200, endMs: 300, charStart: 7, charEnd: 10 },
    ],
  };
  const segments = computeLineSegments(line, []);
  assert.equal(reconstruct(segments), text);
  const emojiSegment = segments.find((s) => s.text.includes('\u{1F3B8}'));
  assert.equal(emojiSegment.text, text.slice(4, 6));
});

test('una línea sin chords en absoluto no revienta (chordsInLine vacío)', () => {
  const line = { id: 'l1', text: 'x', tokens: [] };
  assert.doesNotThrow(() => computeLineSegments(line, []));
});
