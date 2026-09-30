import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, failedGates } from './fixtures.js';
import { renderProgression } from '../../public/js/harmony/synthProgression.js';
import { computeHarmonyFrames } from '../../public/js/harmony/chromaFrontEnd.js';
import { evaluateHarmony } from '../../public/js/harmony/harmonyMetrics.js';
import { decodeSegments, computeFamilyEmissions, familyMinSteps, HARMONY_PRESETS } from '../../public/js/harmony/chordDecoder.js';
import { chooseVariants, refineRegions } from '../../public/js/harmony/chordRefinement.js';
import { FAMILIES, N_FAMILY, familyIndex } from '../../public/js/harmony/chordVocabulary.js';
import { buildHarmonyTrack, redecodeHarmony, applyUserEdit, regionsForSong, HARMONY_VERSION } from '../../public/js/harmony/harmonyTrack.js';

// ---------- decoder on toy emissions ----------

function toyEmissions(T, K, labelAt, margin = 1) {
  const emissions = new Float64Array(T * K);
  for (let t = 0; t < T; t++) emissions[t * K + labelAt(t)] = typeof margin === 'function' ? margin(t) : margin;
  return emissions;
}
const flatCosts = (K, value) => new Float64Array(K * K).fill(value);

test('un parpadeo más corto que la duración mínima no parte el tramo', () => {
  const emissions = toyEmissions(20, 2, (t) => (t === 9 || t === 10 ? 1 : 0));
  const held = decodeSegments({ emissions, T: 20, K: 2, minSteps: [4, 4], switchCost: flatCosts(2, 0.1) }).path;
  assert.deepEqual([...new Set(held)], [0]);
  const free = decodeSegments({ emissions, T: 20, K: 2, minSteps: [1, 1], switchCost: flatCosts(2, 0.1) }).path;
  assert.deepEqual([free[8], free[9], free[10], free[11]], [0, 1, 1, 0]);
});

test('el costo de cambio decide si un tramo corto vale la pena', () => {
  // Two steps with a gain of 1 each: entering and leaving costs twice the switch.
  const emissions = toyEmissions(20, 2, (t) => (t === 9 || t === 10 ? 1 : 0));
  const expensive = decodeSegments({ emissions, T: 20, K: 2, minSteps: [1, 1], switchCost: flatCosts(2, 1.5) }).path;
  assert.equal(expensive[9], 0);
  const cheap = decodeSegments({ emissions, T: 20, K: 2, minSteps: [1, 1], switchCost: flatCosts(2, 0.5) }).path;
  assert.equal(cheap[9], 1);
});

test('un límite marcado deja cambiar gratis pero no obliga, y noChange prohíbe cambiar', () => {
  const weakChange = toyEmissions(20, 2, (t) => (t < 10 ? 0 : 1), (t) => (t < 10 ? 1 : 0.1));
  const base = { emissions: weakChange, T: 20, K: 2, minSteps: [2, 2], switchCost: flatCosts(2, 3) };
  assert.equal(decodeSegments(base).path[15], 0, 'sin marca, una evidencia débil no paga el cambio');
  const freeChange = new Uint8Array(20); freeChange[10] = 1;
  const marked = decodeSegments({ ...base, freeChange }).path;
  assert.equal(marked[9], 0);
  assert.equal(marked[10], 1);

  const steady = toyEmissions(20, 2, () => 0);
  assert.deepEqual([...new Set(decodeSegments({ ...base, emissions: steady, freeChange }).path)], [0], 'la marca no inventa un cambio');

  const strongChange = toyEmissions(20, 2, (t) => (t < 10 ? 0 : 1), 5);
  const noChange = new Uint8Array(20).fill(1);
  assert.equal(new Set(decodeSegments({ ...base, emissions: strongChange, noChange }).path).size, 1);
});

test('relaxed deja terminar un tramo antes de su mínimo', () => {
  const emissions = toyEmissions(18, 3, (t) => (t < 8 ? 0 : t < 10 ? 1 : 2), (t) => (t === 8 || t === 9 ? 5 : 1));
  const input = { emissions, T: 18, K: 3, minSteps: [4, 4, 4], switchCost: flatCosts(3, 0.1) };
  const strict = decodeSegments(input).path;
  assert.ok(strict.filter((label) => label === 1).length >= 4, 'sin relajar, el tramo se estira hasta su mínimo');
  const relaxed = new Uint8Array(18); relaxed[10] = 1;
  const loose = decodeSegments({ ...input, relaxed }).path;
  assert.deepEqual([loose[7], loose[8], loose[9], loose[10]], [0, 1, 1, 2]);
});

test('las posteriores suman 1 y la probabilidad de cambio marca el límite real', () => {
  // Margin 4 per step: moving the change one step costs e^-4, so P(change at 10) ≈ 1/(1 + 2e^-4).
  const emissions = toyEmissions(20, 2, (t) => (t < 10 ? 0 : 1), 4);
  const { posterior, changeProb } = decodeSegments({ emissions, T: 20, K: 2, minSteps: [2, 2], switchCost: flatCosts(2, 2), withPosteriors: true });
  for (let t = 0; t < 20; t++) assert.ok(Math.abs(posterior[t * 2] + posterior[t * 2 + 1] - 1) < 1e-6);
  assert.ok(changeProb[10] > 0.9, `cambio en 10: ${changeProb[10]}`);
  const elsewhere = Math.max(...Array.from(changeProb).filter((_, t) => t !== 10));
  assert.ok(elsewhere < 0.1, `cambio fuera del límite: ${elsewhere}`);
});

// ---------- emissions and minimum durations ----------

function chordStep(index, treble, bass = {}, { stepMs = 300, weight = 0.5, silentFraction = 0 } = {}) {
  const t = new Float64Array(12), b = new Float64Array(12);
  for (const [pc, value] of Object.entries(treble)) t[pc] = value;
  for (const [pc, value] of Object.entries(bass)) b[pc] = value;
  return { startMs: index * stepMs, endMs: (index + 1) * stepMs, weight, beatIndex: Math.floor(index / 2), treble: t, bass: b,
    frameCount: 6, silentFraction, trebleEnergy: t.reduce((sum, value) => sum + value, 0), bassEnergy: b.reduce((sum, value) => sum + value, 0) };
}
const C_MAJOR = { 0: 1, 4: 0.9, 7: 0.8 };
const A_MINOR = { 9: 1, 0: 0.9, 4: 0.8 };
const argmaxRow = (emissions, row, K = FAMILIES.length) => {
  let best = 0;
  for (let k = 1; k < K; k++) if (emissions[row * K + k] > emissions[row * K + best]) best = k;
  return best;
};

test('un paso silencioso fuerza N y cada tríada elige su familia', () => {
  const steps = [chordStep(0, {}, {}, { silentFraction: 1 }), chordStep(1, C_MAJOR, { 0: 1 }), chordStep(2, A_MINOR, { 9: 1 })];
  const emissions = computeFamilyEmissions(steps, { preset: HARMONY_PRESETS.normal });
  assert.equal(argmaxRow(emissions, 0), N_FAMILY);
  assert.ok(emissions[1] < -1e8, 'con silencio ningún acorde es posible');
  assert.equal(argmaxRow(emissions, 1), familyIndex(0, 'maj'));
  assert.equal(argmaxRow(emissions, 2), familyIndex(9, 'min'));
});

test('una restricción de etiqueta deja solo la familia elegida', () => {
  const allowed = [new Set([familyIndex(2, 'min')])];
  const emissions = computeFamilyEmissions([chordStep(0, C_MAJOR, { 0: 1 })], { preset: HARMONY_PRESETS.normal, allowed });
  assert.equal(argmaxRow(emissions, 0), familyIndex(2, 'min'));
});

test('la duración mínima sale del preset, con piso en milisegundos contra el doble tempo', () => {
  const normal = familyMinSteps(HARMONY_PRESETS.normal, { stepsPerBeat: 2, beatsPerBar: 4, stepMs: 300 });
  assert.equal(normal[1], 4);
  assert.equal(normal[N_FAMILY], 2);
  const estable = familyMinSteps(HARMONY_PRESETS.estable, { stepsPerBeat: 2, beatsPerBar: 4, stepMs: 300 });
  assert.equal(estable[1], 8);
  assert.equal(estable[N_FAMILY], 4);
  assert.equal(familyMinSteps(HARMONY_PRESETS.normal, { stepsPerBeat: 1, beatsPerBar: 4, stepMs: 150 })[1], 5);
});

// ---------- refinement on synthetic steps ----------

const clicheSteps = () => [
  ...Array.from({ length: 8 }, (_, i) => chordStep(i, { ...C_MAJOR, 11: 0.05 }, { 0: 1 })),
  ...Array.from({ length: 8 }, (_, i) => chordStep(8 + i, { ...C_MAJOR, 11: 0.8 }, { 0: 1 })),
  ...Array.from({ length: 8 }, (_, i) => chordStep(16 + i, { ...C_MAJOR, 10: 0.8 }, { 0: 1 })),
  ...Array.from({ length: 8 }, (_, i) => chordStep(24 + i, { ...C_MAJOR, 9: 0.8 }, { 0: 1 })),
];

test('el cliché C–Cmaj7–C7–C6 sale compás por compás en Normal y Detallada; Estable deja un color por región', () => {
  const family = FAMILIES[familyIndex(0, 'maj')];
  for (const preset of [HARMONY_PRESETS.normal, HARMONY_PRESETS.detallada]) {
    const { runs } = chooseVariants(clicheSteps(), family, preset, 2);
    assert.deepEqual(runs.map((run) => [run.start, run.candidate.variant.quality]), [[0, ''], [8, 'maj7'], [16, '7'], [24, '6']], preset.id);
  }
  assert.equal(chooseVariants(clicheSteps(), family, HARMONY_PRESETS.estable, 2).runs.length, 1);
});

test('una séptima débil que se filtra no se inventa', () => {
  const steps = Array.from({ length: 16 }, (_, i) => chordStep(i, { ...C_MAJOR, 11: 0.2 }, { 0: 1 }));
  const { runs } = chooseVariants(steps, FAMILIES[familyIndex(0, 'maj')], HARMONY_PRESETS.normal, 2);
  assert.deepEqual(runs.map((run) => run.candidate.variant.quality), ['']);
});

const refine = (steps, familyId, preset = HARMONY_PRESETS.normal) => refineRegions({
  path: new Int32Array(steps.length).fill(familyId), steps, posterior: null, changeProb: null,
  grid: { stepsPerBeat: 2 }, preset, key: null, durationMs: steps.at(-1).endMs,
}).map((region) => region.symbol);

test('un bajo sostenido escribe slash y un bajo caminante no parte la región', () => {
  const descending = [9, 7, 6].flatMap((bass, bar) => Array.from({ length: 8 }, (_, i) => chordStep(bar * 8 + i, A_MINOR, { [bass]: 1 })));
  assert.deepEqual(refine(descending, familyIndex(9, 'min')), ['Am', 'Am/G', 'Am/F#']);
  const line = [0, 2, 4, 5, 7, 9, 11, 0, 0, 0, 0, 0];
  const walking = line.flatMap((bass, beat) => [0, 1].map((half) => chordStep(beat * 2 + half, C_MAJOR, { [bass]: 1 })));
  assert.deepEqual(refine(walking, familyIndex(0, 'maj')), ['C']);
});

test('un color que solo vive en el bajo se escribe tríada sobre bajo (Am/G, no Am7/G)', () => {
  const steps = [
    ...Array.from({ length: 8 }, (_, i) => chordStep(i, A_MINOR, { 9: 1 })),
    ...Array.from({ length: 8 }, (_, i) => chordStep(8 + i, { ...A_MINOR, 7: 0.35 }, { 7: 1 })),
  ];
  assert.deepEqual(refine(steps, familyIndex(9, 'min')), ['Am', 'Am/G']);
});

// ---------- the harmony track and the musician's edits ----------

const trackCache = new Map();
function trackFor(id) {
  if (!trackCache.has(id)) {
    const audio = renderProgression(FIXTURES.find((fixture) => fixture.id === id).spec);
    const frames = computeHarmonyFrames(audio.pcm, audio.sampleRate);
    trackCache.set(id, { audio, track: buildHarmonyTrack({ frames, beatsSec: audio.beatTimesSec, bpm: audio.bpm, durationMs: audio.durationMs }) });
  }
  return trackCache.get(id);
}
const chordsOf = (track) => track.regions.filter((region) => region.state === 'harmony').map((region) => region.symbol);
const regionAt = (track, timeMs) => track.regions.find((region) => region.startMs <= timeMs && region.endMs > timeMs);

test('la pista v6 cubre toda la canción, sin huecos y con ids estables', () => {
  const { audio, track } = trackFor('pop4');
  assert.equal(track.version, HARMONY_VERSION);
  assert.equal(track.regions[0].startMs, 0);
  assert.equal(track.regions.at(-1).endMs, audio.durationMs);
  track.regions.slice(1).forEach((region, index) => assert.equal(region.startMs, track.regions[index].endMs));
  assert.equal(new Set(track.regions.map((region) => region.id)).size, track.regions.length);
  track.regions.forEach((region) => assert.equal(region.id, `h-${region.startMs}`));
  assert.deepEqual(chordsOf(track), ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
});

test('elegir un acorde lo fija, sobrevive a cambiar la sensibilidad y "borrar" vuelve al automático', () => {
  const { track } = trackFor('pop4');
  const target = track.regions[1];
  const edited = applyUserEdit(track, { type: 'label', startMs: target.startMs, endMs: target.endMs, symbol: 'G7' });
  const region = regionAt(edited, target.startMs);
  assert.equal(region.symbol, 'G7');
  assert.equal(region.source, 'user');
  assert.equal(region.confirmed, true);
  assert.equal(region.selectedSymbol, 'G7');
  const others = (list) => list.filter((_, index) => index !== 1);
  assert.deepEqual(others(chordsOf(edited)), others(chordsOf(track)), 'los demás acordes no cambian');
  for (const sensitivity of ['estable', 'detallada']) {
    const redecoded = redecodeHarmony(edited, { sensitivity });
    assert.equal(regionAt(redecoded, target.startMs).symbol, 'G7', sensitivity);
    assert.equal(regionAt(redecoded, target.startMs).source, 'user', sensitivity);
  }
  const cleared = applyUserEdit(edited, { type: 'clear', startMs: target.startMs, endMs: target.endMs });
  assert.equal(cleared.constraints.length, 0);
  assert.equal(regionAt(cleared, target.startMs).symbol, 'G');
  assert.equal(regionAt(cleared, target.startMs).confirmed, false);
});

test('confirmar acepta el acorde automático y el cifrado recibe estimados y confirmados', () => {
  const { track } = trackFor('pop4');
  const target = track.regions[2];
  const confirmed = applyUserEdit(track, { type: 'confirm', startMs: target.startMs, endMs: target.endMs });
  const region = regionAt(confirmed, target.startMs);
  assert.equal(region.symbol, 'Am');
  assert.equal(region.confirmed, true);
  assert.equal(region.source, 'auto');
  assert.equal(region.selectedSymbol, 'Am');
  assert.deepEqual(regionsForSong(confirmed, { includeAuto: false }).map((item) => item.symbol), ['Am']);
  const all = regionsForSong(confirmed);
  assert.equal(all.length, 8);
  assert.equal(all.filter((item) => item.confirmed).length, 1);
});

test('confirmar después de corregir confirma la respuesta del motor, no la corrección anterior', () => {
  const { track } = trackFor('pop4');
  const target = track.regions[1];
  const edited = applyUserEdit(track, { type: 'label', startMs: target.startMs, endMs: target.endMs, symbol: 'Em' });
  const confirmed = applyUserEdit(edited, { type: 'confirm', startMs: target.startMs, endMs: target.endMs });
  const region = regionAt(confirmed, target.startMs);
  assert.deepEqual([region.symbol, region.source, region.confirmed], ['G', 'auto', true]);
  assert.equal(confirmed.constraints.length, 1);
});

test('dividir corta la región aunque el acorde siga, y unir la vuelve a una', () => {
  const { track } = trackFor('pop4');
  const first = track.regions[0];
  const split = applyUserEdit(track, { type: 'split', atMs: (first.startMs + first.endMs) / 2 });
  const halves = split.regions.filter((region) => region.startMs < first.endMs);
  assert.equal(halves.length, 2);
  assert.deepEqual(halves.map((region) => region.symbol), ['C', 'C'], 'la marca no inventa otro acorde');
  assert.equal(halves[1].boundaryStrength, 1);
  const merged = applyUserEdit(split, { type: 'merge', startMs: first.startMs, endMs: first.endMs });
  assert.equal(merged.regions.filter((region) => region.startMs > first.startMs && region.startMs < first.endMs).length, 0);
  assert.deepEqual(merged.constraints.map((item) => item.type), ['merge']);
});

test('marcar un límite donde de verdad cambia encuentra el acorde que faltaba', () => {
  // In "fast", Normal keeps one G for the two beats G–G7 (colors need four).
  const { track } = trackFor('fast');
  assert.equal(regionAt(track, 7600).symbol, 'G');
  const split = applyUserEdit(track, { type: 'split', atMs: 7500 });
  assert.equal(regionAt(split, 7200).symbol, 'G');
  assert.equal(regionAt(split, 7600).symbol, 'G7');
});

// ---------- quick fixtures against their gates ----------

for (const fixture of FIXTURES.filter((item) => item.quick)) {
  test(`fixture ${fixture.id}: ${fixture.notes}`, () => {
    const audio = renderProgression(fixture.spec);
    const frames = computeHarmonyFrames(audio.pcm, audio.sampleRate);
    const track = buildHarmonyTrack({ frames, beatsSec: audio.beatTimesSec, bpm: audio.bpm, durationMs: audio.durationMs });
    const estimate = track.regions.map((region) => ({ startMs: region.startMs, endMs: region.endMs, symbol: region.symbol }));
    const metrics = { ...evaluateHarmony(audio.reference, estimate, { durationMs: audio.durationMs }), durationMs: audio.durationMs };
    assert.deepEqual(failedGates(fixture, metrics), []);
  });
}
