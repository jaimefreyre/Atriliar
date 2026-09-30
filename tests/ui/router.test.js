import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeTo } from '../../public/js/ui/shell/router.js';

test('router reconoce biblioteca y modos de canción y conserva consulta', () => {
  assert.equal(parseRoute('#/').name, 'library');
  const route = parseRoute('#/cancion/tema%20uno/loopera?v1=1');
  assert.equal(route.name, 'song');
  assert.equal(route.songId, 'tema uno');
  assert.equal(route.mode, 'loopera');
  assert.equal(route.params.get('v1'), '1');
});

test('router normaliza un modo desconocido y construye rutas codificadas', () => {
  assert.equal(parseRoute('#/cancion/a/no-existe').mode, 'autopsia');
  assert.equal(routeTo({ name: 'song', songId: 'tema / uno', mode: 'karaoke' }), '#/cancion/tema%20%2F%20uno/karaoke');
});
