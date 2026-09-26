import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashDocument } from '../../public/js/data/reviewState.js';

// Solo la parte pura (hash canónico); markReviewed/isLocallyReviewed tocan
// IndexedDB y se verifican con automatización de navegador, no node:test.

test('el hash es estable y no depende del orden de inserción de las claves', async () => {
  const a = { id: 'x', metadata: { title: 'Uno', bpm: 120 }, sections: [{ id: 's1', startMs: 0 }] };
  const b = { sections: [{ startMs: 0, id: 's1' }], metadata: { bpm: 120, title: 'Uno' }, id: 'x' };
  assert.equal(await hashDocument(a), await hashDocument(b));
});

test('el hash cambia si cambia cualquier valor', async () => {
  const a = { id: 'x', metadata: { bpm: 120 } };
  const b = { id: 'x', metadata: { bpm: 121 } };
  assert.notEqual(await hashDocument(a), await hashDocument(b));
});

test('el hash distingue arrays de objetos con las mismas claves', async () => {
  const a = { list: [1, 2, 3] };
  const b = { list: [3, 2, 1] };
  assert.notEqual(await hashDocument(a), await hashDocument(b));
});

test('el hash es determinístico entre llamadas', async () => {
  const doc = { id: 'demo', chords: [{ symbol: 'C', startMs: 0 }] };
  const h1 = await hashDocument(doc);
  const h2 = await hashDocument(doc);
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});
