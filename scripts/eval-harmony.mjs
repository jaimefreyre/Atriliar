#!/usr/bin/env node
// Chord-recognition evaluation on synthetic fixtures with a known answer key.
//
//   node scripts/eval-harmony.mjs                     v6 engine, three presets, every fixture
//   node scripts/eval-harmony.mjs --engines v6,essentia-cdb
//   node scripts/eval-harmony.mjs --fixtures pop4,walking --verbose
//   node scripts/eval-harmony.mjs --json report.json --check tests/harmony/harmony-baseline.json
//   node scripts/eval-harmony.mjs --oracle              front end vs Essentia LogSpectrum/NNLSChroma (~1 min)
//
// "essentia-cdb" is Essentia's ChordsDetectionBeats as a neutral baseline
// (the vendored Essentia, loaded in Node with shims). The pre-v6 recognizer
// was measured once before it was removed: docs/rediseno/E1-comparacion-motores.json.

import { writeFileSync, readFileSync } from 'node:fs';
import { FIXTURES, failedGates } from '../tests/harmony/fixtures.js';
import { renderProgression } from '../public/js/harmony/synthProgression.js';
import { computeHarmonyFrames } from '../public/js/harmony/chromaFrontEnd.js';
import { buildHarmonyTrack, redecodeHarmony } from '../public/js/harmony/harmonyTrack.js';
import { evaluateHarmony } from '../public/js/harmony/harmonyMetrics.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const engines = option('engines', 'v6').split(',');
const presets = option('presets', 'estable,normal,detallada').split(',');
const wanted = option('fixtures', null)?.split(',');
const fixtures = FIXTURES.filter((fixture) => !wanted || wanted.includes(fixture.id));

if (flag('oracle')) {
  // One short fixture is enough: the check is per frame, and Essentia's LogSpectrum is slow.
  const { loadEssentiaNode } = await import('./lib/loadEssentiaNode.mjs');
  const { compareFrontEndWithEssentia } = await import('./lib/essentiaOracle.mjs');
  const fixture = FIXTURES.find((item) => item.id === (wanted?.[0] || 'silence'));
  const check = compareFrontEndWithEssentia(await loadEssentiaNode(), renderProgression(fixture.spec));
  console.log(`== Oráculo Essentia · ${fixture.id}: coseno de croma (sin NNLS) mediana ${check.median.toFixed(3)} · p10 ${check.p10.toFixed(3)} · mín ${check.min.toFixed(3)}`
    + ` · ${check.frames} cuadros · Essentia ${check.essentiaSeconds.toFixed(1)} s vs JS ${check.jsSeconds.toFixed(2)} s`);
  if (check.p10 < 0.95) { console.error('El frente de señal se apartó de Essentia.'); process.exitCode = 1; }
  process.exit();
}

let baselineEngines = null;
if (engines.some((engine) => engine !== 'v6')) {
  const { loadEssentiaNode } = await import('./lib/loadEssentiaNode.mjs');
  const essentia = await loadEssentiaNode();
  baselineEngines = {};
  if (engines.includes('essentia-cdb')) {
    const { runEssentiaChordsBeats } = await import('./lib/essentiaChords.mjs');
    baselineEngines['essentia-cdb'] = (audio) => runEssentiaChordsBeats(essentia, { pcm44100: audio.pcm, beatsSec: audio.beatTimesSec, durationMs: audio.durationMs });
  }
}

const fmt = (value) => (value === null || value === undefined ? '  -  ' : value.toFixed(3));
const toSegments = (regions) => regions.map((region) => ({ startMs: region.startMs, endMs: region.endMs, symbol: region.symbol }));
// Per-beat outputs repeat the chord on every beat; read them the way a chart
// would (repeats merged), which is the most favourable reading for them.
const PER_BEAT = new Set(['essentia-cdb/chords-beats']);
const mergeRepeats = (segments) => segments.reduce((merged, segment) => {
  const last = merged.at(-1);
  if (last && (last.symbol || null) === (segment.symbol || null) && last.endMs === segment.startMs) last.endMs = segment.endMs;
  else merged.push({ ...segment });
  return merged;
}, []);
const report = { generatedAt: new Date().toISOString(), fixtures: {} };
let gateFailures = 0;

for (const fixture of fixtures) {
  const audio = renderProgression(fixture.spec);
  const entry = { notes: fixture.notes, durationMs: audio.durationMs, results: {} };
  console.log(`\n== ${fixture.id} · ${fixture.notes}`);
  if (flag('verbose')) console.log(`   ref: ${audio.reference.map((r) => `${r.symbol}@${(r.startMs / 1000).toFixed(1)}`).join(' ')}`);
  const runs = [];
  if (engines.includes('v6')) {
    const frames = computeHarmonyFrames(audio.pcm, audio.sampleRate);
    const base = buildHarmonyTrack({ frames, beatsSec: audio.beatTimesSec, bpm: audio.bpm, durationMs: audio.durationMs });
    for (const preset of presets) runs.push({ name: `v6/${preset}`, preset, regions: (preset === base.sensitivity ? base : redecodeHarmony(base, { sensitivity: preset })).regions });
  }
  for (const engine of engines.filter((name) => name !== 'v6')) {
    if (!baselineEngines[engine]) throw new Error(`Motor desconocido: ${engine} (disponibles: v6, essentia-cdb)`);
    const result = baselineEngines[engine](audio);
    for (const [variant, regions] of Object.entries(result)) runs.push({ name: `${engine}/${variant}`, regions });
  }
  for (const run of runs) {
    if (PER_BEAT.has(run.name)) run.regions = mergeRepeats(run.regions);
    const metrics = { ...evaluateHarmony(audio.reference, toSegments(run.regions), { durationMs: audio.durationMs }), durationMs: audio.durationMs };
    const failures = run.name === 'v6/normal' ? failedGates(fixture, metrics) : [];
    gateFailures += failures.length;
    entry.results[run.name] = { majmin: metrics.wcsr.majmin, majminInv: metrics.wcsr.majminInv, sevenths: metrics.wcsr.sevenths, root: metrics.wcsr.root,
      overSegmentation: metrics.overSegmentation, underSegmentation: metrics.underSegmentation, boundaryF1: metrics.boundary.f1,
      spurious: metrics.boundary.spurious, missed: metrics.boundary.missed, changesPerMinute: metrics.changesPerMinute.estimate,
      referenceChangesPerMinute: metrics.changesPerMinute.reference, noChordRecall: metrics.noChordRecall, failures };
    console.log(`   ${run.name.padEnd(22)} mm ${fmt(metrics.wcsr.majmin)} inv ${fmt(metrics.wcsr.majminInv)} 7ª ${fmt(metrics.wcsr.sevenths)} `
      + `sobre ${fmt(metrics.overSegmentation)} sub ${fmt(metrics.underSegmentation)} F1 ${fmt(metrics.boundary.f1)} `
      + `cambios/min ${metrics.changesPerMinute.estimate.toFixed(0)}/${metrics.changesPerMinute.reference.toFixed(0)}`
      + (failures.length ? `  ✗ ${failures.join('; ')}` : ''));
    if (flag('verbose')) console.log(`      ${run.regions.map((r) => `${r.symbol || 'N'}@${(r.startMs / 1000).toFixed(1)}`).join(' ')}`);
  }
  report.fixtures[fixture.id] = entry;
}

// Averages skip fixtures where a metric does not apply (e.g. majmin on power chords).
const summary = {};
const METRICS = ['majmin', 'sevenths', 'overSegmentation', 'underSegmentation', 'boundaryF1', 'noChordRecall', 'changesRatio'];
for (const entry of Object.values(report.fixtures)) {
  for (const [name, result] of Object.entries(entry.results)) {
    summary[name] ||= Object.fromEntries(METRICS.map((metric) => [metric, { sum: 0, count: 0 }]));
    const values = { ...result, changesRatio: result.changesPerMinute / Math.max(1e-9, result.referenceChangesPerMinute) };
    for (const metric of METRICS) {
      if (values[metric] === null || values[metric] === undefined || Number.isNaN(values[metric])) continue;
      summary[name][metric].sum += values[metric]; summary[name][metric].count++;
    }
  }
}
const averageOf = (cell) => (cell.count ? cell.sum / cell.count : null);
console.log('\n== Resumen (promedios; cambios = cambios/min estimados ÷ referencia)');
for (const [name, cells] of Object.entries(summary)) {
  const value = (metric) => fmt(averageOf(cells[metric]));
  console.log(`   ${name.padEnd(26)} mm ${value('majmin')} 7ª ${value('sevenths')} sobre ${value('overSegmentation')} sub ${value('underSegmentation')} `
    + `F1 ${value('boundaryF1')} N ${value('noChordRecall')} cambios ${value('changesRatio')}×`);
}
report.summary = Object.fromEntries(Object.entries(summary).map(([name, cells]) => [name,
  Object.fromEntries(METRICS.map((metric) => [metric, averageOf(cells[metric]) === null ? null : Number(averageOf(cells[metric]).toFixed(4))]))]));

const jsonPath = option('json', null);
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const baselinePath = option('check', null);
if (baselinePath) {
  // Ratchet: no fixture may drop more than 0.02 below the stored baseline.
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const drops = [];
  for (const [id, entry] of Object.entries(baseline.fixtures)) {
    const current = report.fixtures[id]?.results['v6/normal'];
    const previous = entry.results['v6/normal'];
    if (!current || !previous) continue;
    for (const metric of ['majmin', 'overSegmentation', 'underSegmentation', 'boundaryF1']) {
      if (previous[metric] !== null && current[metric] !== null && current[metric] < previous[metric] - 0.02) drops.push(`${id}.${metric} ${current[metric].toFixed(3)} < ${previous[metric].toFixed(3)}`);
    }
  }
  if (drops.length) { console.error(`\nRetrocesos contra la línea base:\n  ${drops.join('\n  ')}`); process.exitCode = 1; }
}
if (gateFailures) { console.error(`\n${gateFailures} umbral(es) sin cumplir en v6/normal.`); process.exitCode = 1; }
