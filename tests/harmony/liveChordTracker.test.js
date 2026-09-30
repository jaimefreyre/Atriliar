import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveChordTracker, createChordVerifier, LIVE_PRESETS } from '../../public/js/harmony/liveChordTracker.js';
import { createLiveChromaAnalyzer } from '../../public/js/harmony/chromaFrontEnd.js';
import { renderProgression } from '../../public/js/harmony/synthProgression.js';

const chroma = (entries) => { const out = new Array(12).fill(0.02); for (const [pc, value] of Object.entries(entries)) out[pc] = value; return out; };
const C = { treble: chroma({ 0: 1, 4: 0.9, 7: 0.8 }), bass: chroma({ 0: 1 }) };
const G = { treble: chroma({ 7: 1, 11: 0.9, 2: 0.8 }), bass: chroma({ 7: 1 }) };
const CMAJ7 = { treble: chroma({ 0: 1, 4: 0.9, 7: 0.8, 11: 0.8 }), bass: chroma({ 0: 1 }) };
const HOP = 46;

/** Feed `frame` for `ms`, returning the confirmed symbol shown after each frame. */
function feed(tracker, frame, ms, clock) {
  const shown = [];
  for (const end = clock.t + ms; clock.t < end; clock.t += HOP) {
    const result = tracker.update({ ...frame, timestampMs: clock.t });
    shown.push({ atMs: clock.t, symbol: result.confirmed?.symbol ?? null, result });
  }
  return shown;
}
const changes = (shown) => shown.reduce((list, item) => (list.at(-1) === item.symbol ? list : [...list, item.symbol]), []);

test('un cambio de acorde se muestra tras el sostén, sin parpadeo', () => {
  const tracker = createLiveChordTracker();
  const clock = { t: 0 };
  const first = feed(tracker, C, 2000, clock);
  const second = feed(tracker, G, 2000, clock);
  assert.deepEqual(changes([...first, ...second]), [null, 'C', 'G']);
  const shownAt = second.find((item) => item.symbol === 'G').atMs - 2000;
  assert.ok(shownAt >= LIVE_PRESETS.normal.holdMs && shownAt <= 600, `G se mostró a los ${shownAt} ms`);
});

test('los cuadros sin señal solo relajan la creencia: el acorde no se borra', () => {
  const tracker = createLiveChordTracker();
  const clock = { t: 0 };
  feed(tracker, C, 2000, clock);
  const quiet = feed(tracker, { usable: false }, 3000, clock);
  assert.ok(quiet.every((item) => item.symbol === 'C'));
  assert.ok(quiet.at(-1).result.confirmed.score < quiet[0].result.confirmed.score, 'la certeza baja sin evidencia');
  const back = feed(tracker, G, 1500, clock);
  assert.equal(back.at(-1).symbol, 'G');
});

test('un color aparece solo si se sostiene', () => {
  const tracker = createLiveChordTracker();
  const clock = { t: 0 };
  const shown = [...feed(tracker, C, 2000, clock), ...feed(tracker, CMAJ7, 300, clock), ...feed(tracker, C, 1000, clock)];
  assert.deepEqual(changes(shown), [null, 'C'], 'una séptima de 300 ms no se muestra');
  const sustained = feed(tracker, CMAJ7, 2500, clock);
  assert.equal(sustained.at(-1).symbol, 'Cmaj7');
  const shownAfter = sustained.find((item) => item.symbol === 'Cmaj7').atMs - (clock.t - 2500);
  assert.ok(shownAfter < 2200, `Cmaj7 apareció a los ${shownAfter} ms`);
});

test('una nota sola no confirma un acorde', () => {
  const tracker = createLiveChordTracker();
  const shown = feed(tracker, { treble: chroma({ 9: 1 }), bass: chroma({ 9: 1 }) }, 2000, { t: 0 });
  assert.ok(shown.every((item) => item.symbol === null));
  assert.equal(shown.at(-1).result.noChord, true);
});

test('con audio real a 48 kHz sigue C–G–Am–F sin parpadeo y con menos de 0,6 s de demora', () => {
  const rate = 48000, frameSize = 8192, hop = 2048;
  const audio = renderProgression({ bpm: 100, sampleRate: rate, chords: ['C', 'G', 'Am', 'F'].map((symbol) => ({ symbol, beats: 4 })) });
  const analyzer = createLiveChromaAnalyzer({ sampleRate: rate, frameSize });
  const tracker = createLiveChordTracker({ frameMs: (hop / rate) * 1000 });
  const shown = [];
  for (let end = frameSize; end <= audio.pcm.length; end += hop) {
    const { treble, bass } = analyzer.analyze(audio.pcm.subarray(end - frameSize, end));
    const timeMs = ((end - frameSize / 2) / rate) * 1000;
    const symbol = tracker.update({ treble, bass, timestampMs: timeMs }).confirmed?.symbol ?? null;
    if (shown.at(-1)?.symbol !== symbol) shown.push({ symbol, atMs: timeMs });
  }
  assert.deepEqual(shown.map((item) => item.symbol), [null, 'C', 'G', 'Am', 'F']);
  for (const ref of audio.reference.slice(1, 4)) {
    const delay = shown.find((item) => item.symbol === ref.symbol).atMs - ref.startMs;
    assert.ok(delay > 0 && delay < 600, `${ref.symbol}: ${delay.toFixed(0)} ms`);
  }
});

test('el cotejo dice coincide, parcial o no coincide, y mantiene el último veredicto mientras verifica', () => {
  const run = (expected) => {
    const tracker = createLiveChordTracker();
    const verifier = createChordVerifier();
    const verdicts = [];
    for (let t = 0; t < 2000; t += HOP) verdicts.push(verifier.update({ expected, result: tracker.update({ ...C, timestampMs: t }), timestampMs: t }));
    return verdicts;
  };
  const matching = run(['C']);
  assert.equal(matching.at(-1).status, 'coincide');
  assert.ok(matching.some((verdict) => verdict.pending), 'antes de decidir queda pendiente');
  const partial = run(['C7']).at(-1);
  assert.deepEqual([partial.status, partial.missing], ['parcial', ['A#']]);
  const wrong = run(['G']).at(-1);
  assert.deepEqual([wrong.status, wrong.expected, wrong.soundsLike], ['no-coincide', 'G', 'C']);
  assert.equal(run([]).at(-1).status, 'sin-referencia');
});
