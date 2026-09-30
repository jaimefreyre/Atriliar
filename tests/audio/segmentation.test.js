import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnclassifiedSections, segmentChordSuggestions } from '../../public/js/audio/segmentation.js';

test('recorta candidatos a la duración, resuelve solapes y une repeticiones contiguas', () => {
  assert.deepEqual(segmentChordSuggestions([
    { symbol: 'C', startMs: -20, endMs: 1000, confidence: 0.9, confirmed: true },
    { symbol: 'C', startMs: 900, endMs: 2000, confidence: 0.8, confirmed: true },
    { symbol: 'G', startMs: 2000, endMs: 4000, confidence: 0.7, confirmed: true },
    { symbol: 'G', startMs: 4000, endMs: 5000, confidence: 0.7 },
    { symbol: 'F', startMs: 5000, endMs: 9000, confidence: 0.7 },
  ], 6000), [
    { symbol: 'C', startMs: 0, endMs: 2000, confidence: 0.8, confirmed: true },
    { symbol: 'G', startMs: 2000, endMs: 5000, confidence: 0.7, confirmed: false },
    { symbol: 'F', startMs: 5000, endMs: 6000, confidence: 0.7, confirmed: false },
  ]);
});

test('estructura desconocida es una sola sección exacta, no una etiqueta inferida', () => {
  assert.deepEqual(createUnclassifiedSections(1000), [{ id: 'section-audio-draft', type: 'instrumental',
    label: 'BORRADOR · ESTRUCTURA SIN CLASIFICAR', key: null, startMs: 0, endMs: 1000 }]);
  assert.throws(() => createUnclassifiedSections(0), RangeError);
});
