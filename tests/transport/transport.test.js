import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../../public/js/transport/transport.js';

// node:test no corre en un navegador: requestAnimationFrame no existe. El
// propio tick loop solo importa para notificar mientras se reproduce y para
// detectar el final; el cálculo de positionMs es puro y no depende de que
// el loop haya corrido, así que la mayoría de los tests no lo necesitan.
// Los que sí (llegar al final) usan este polyfill mínimo basado en timers.
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

function createFakeAdapter({ rate = 1 } = {}) {
  let clockMs = 0;
  const calls = { onPlay: 0, onPause: 0, onSeek: [], onDispose: 0, lastPlayRate: null };
  const adapter = {
    now: () => clockMs,
    rate,
    onPlay: (fromSongMs, r) => { calls.onPlay++; calls.lastPlayRate = r; },
    onPause: () => { calls.onPause++; },
    onSeek: (ms) => { calls.onSeek.push(ms); },
    onDispose: () => { calls.onDispose++; },
  };
  return { adapter, calls, advance: (ms) => { clockMs += ms; } };
}

test('estado inicial: ready, positionMs 0', () => {
  const { adapter } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  const snap = t.getSnapshot();
  assert.equal(snap.state, 'ready');
  assert.equal(snap.positionMs, 0);
  assert.equal(snap.mode, 'generated');
  t.dispose();
});

test('play avanza con el reloj inyectado; pause congela la posición', () => {
  const { adapter, advance } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  t.play();
  advance(1000);
  assert.equal(t.getSnapshot().positionMs, 1000);
  t.pause();
  assert.equal(t.getSnapshot().state, 'paused');
  advance(5000); // el reloj sigue, pero en pausa no debe importar
  assert.equal(t.getSnapshot().positionMs, 1000);
  t.dispose();
});

test('pausar 5s y continuar no avanza la canción durante la pausa', () => {
  const { adapter, advance } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  t.play();
  advance(2000);
  t.pause();
  advance(5000); // "5 segundos reales" mientras está en pausa
  t.play();
  advance(1000);
  assert.equal(t.getSnapshot().positionMs, 3000); // 2000 + 1000, los 5000 de pausa no cuentan
  t.dispose();
});

test('seek a 0, a una frontera y al final selecciona posiciones correctas y clampea', () => {
  const { adapter } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  t.seek(0);
  assert.equal(t.getSnapshot().positionMs, 0);
  t.seek(10000);
  assert.equal(t.getSnapshot().positionMs, 10000);
  t.seek(999999); // más allá del final: clampea, no explota
  assert.equal(t.getSnapshot().positionMs, 10000);
  t.seek(-500); // negativo: clampea a 0
  assert.equal(t.getSnapshot().positionMs, 0);
  t.dispose();
});

test('repetir play no duplica el "motor" del adapter mientras ya está reproduciendo', () => {
  const { adapter, calls } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  t.play();
  t.play();
  t.play();
  assert.equal(calls.onPlay, 1);
  t.dispose();
});

test('setRate solo se acepta en pausa (no durante reproducción)', () => {
  const { adapter } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  assert.equal(t.setRate(1.5), true); // 'ready' cuenta como no-reproduciendo
  t.play();
  assert.equal(t.setRate(2), false);
  assert.equal(t.getSnapshot().rate, 1.5); // no cambió
  t.pause();
  assert.equal(t.setRate(2), true);
  assert.equal(t.getSnapshot().rate, 2);
  t.dispose();
});

test('rate afecta la velocidad de avance de positionMs', () => {
  const { adapter, advance } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  t.setRate(2);
  t.play();
  advance(1000);
  assert.equal(t.getSnapshot().positionMs, 2000); // el doble de rápido
  t.dispose();
});

test('llega al final solo (estado "ended"), sin reprogramar otro frame', async () => {
  const { adapter, advance } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 100, adapter });
  t.play();
  advance(500); // más allá del final
  await new Promise((resolve) => setTimeout(resolve, 20)); // deja correr el tick loop (timers)
  const snap = t.getSnapshot();
  assert.equal(snap.state, 'ended');
  assert.equal(snap.positionMs, 100);
  t.dispose();
});

test('dispose limpia: llama onDispose una vez y deja de notificar', () => {
  const { adapter, calls } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 10000, adapter });
  let notifications = 0;
  t.subscribe(() => { notifications++; });
  t.play();
  const before = notifications;
  t.dispose();
  t.dispose(); // segunda llamada no debe volver a disparar onDispose
  assert.equal(calls.onDispose, 1);
  t.seek(500); // acciones tras dispose no deben notificar ni tocar el adapter
  assert.equal(notifications, before);
});

test('cien ciclos de play/pause/seek no acumulan llamadas de más al adapter', () => {
  const { adapter, calls, advance } = createFakeAdapter();
  const t = createTransport({ mode: 'generated', durationMs: 60000, adapter });
  for (let i = 0; i < 100; i++) {
    t.play();
    advance(10);
    t.seek(i * 5);
    t.pause();
  }
  assert.equal(calls.onPlay, 100);
  assert.equal(calls.onPause, 100);
  assert.equal(calls.onSeek.length, 100);
  t.dispose();
  assert.equal(calls.onDispose, 1);
});

// Como audioTrack.js: now() devuelve la posición del propio elemento, que
// onPlay/onSeek mueven. El reloj falso de arriba corre libre y no detecta
// errores de orden entre "re-anclar" y "reposicionar el medio".
function createFakeMediaAdapter() {
  let mediaMs = 0;
  let playing = false;
  const adapter = {
    now: () => mediaMs,
    rate: 1,
    supportsRateChange: false,
    onPlay: (fromSongMs) => { mediaMs = fromSongMs; playing = true; },
    onPause: () => { playing = false; },
    onSeek: (ms) => { mediaMs = ms; },
    onDispose: () => { playing = false; },
  };
  return { adapter, advance: (ms) => { if (playing) mediaMs += ms; } };
}

// Si una aserción falla antes del dispose(), el tick loop sigue
// reprogramándose con el polyfill de rAF y la suite nunca termina.
function mediaTransport(ctx, durationMs) {
  const { adapter, advance } = createFakeMediaAdapter();
  const transport = createTransport({ mode: 'audio', durationMs, adapter });
  ctx.after(() => transport.dispose());
  return { t: transport, advance };
}

test('audio real: buscar durante la reproducción queda exacto hacia atrás y hacia adelante', (ctx) => {
  const { t, advance } = mediaTransport(ctx, 120000);
  t.play();
  advance(30000);
  assert.equal(t.getSnapshot().positionMs, 30000);
  t.seek(10000);
  assert.equal(t.getSnapshot().positionMs, 10000);
  advance(5000);
  assert.equal(t.getSnapshot().positionMs, 15000);
  t.seek(60000);
  assert.equal(t.getSnapshot().positionMs, 60000);
  advance(1000);
  assert.equal(t.getSnapshot().positionMs, 61000);
});

test('audio real: detener y volver a reproducir arranca en 0 sin atraso', (ctx) => {
  const { t, advance } = mediaTransport(ctx, 120000);
  t.play();
  advance(30000);
  t.stop();
  assert.equal(t.getSnapshot().positionMs, 0);
  t.play();
  assert.equal(t.getSnapshot().positionMs, 0);
  advance(2000);
  assert.equal(t.getSnapshot().positionMs, 2000);
});

test('audio real: buscar en pausa y reanudar continúa desde el destino', (ctx) => {
  const { t, advance } = mediaTransport(ctx, 120000);
  t.play();
  advance(5000);
  t.pause();
  assert.equal(t.getSnapshot().positionMs, 5000);
  t.seek(20000);
  assert.equal(t.getSnapshot().positionMs, 20000);
  t.play();
  advance(1000);
  assert.equal(t.getSnapshot().positionMs, 21000);
});

test('audio real: tras llegar al final, play vuelve a empezar desde 0', async (ctx) => {
  const { t, advance } = mediaTransport(ctx, 100);
  t.play();
  advance(500);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(t.getSnapshot().state, 'ended');
  t.play();
  assert.equal(t.getSnapshot().positionMs, 0);
  advance(50);
  assert.equal(t.getSnapshot().positionMs, 50);
});

test('modo manual (rate 0): la posición nunca avanza sola, solo por seek', async () => {
  const { createManualAdapter } = await import('../../public/js/transport/manual.js');
  const t = createTransport({ mode: 'manual', durationMs: 20000, adapter: createManualAdapter() });
  t.play();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(t.getSnapshot().positionMs, 0);
  t.seek(5000);
  assert.equal(t.getSnapshot().positionMs, 5000);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(t.getSnapshot().positionMs, 5000); // sigue sin avanzar sola
  t.dispose();
});
