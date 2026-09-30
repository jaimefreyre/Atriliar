import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAnalysisToV6, legacyChoicesAsConstraints, editAnalysisHarmony, setAnalysisSensitivity, isProvisionalHarmony }
  from '../../public/js/harmony/analysisHarmony.js';

// A pre-v6 analysis as the lab stored it: per-beat HPCP chroma with bass
// peaks, v5 regions, and chords the musician picked in both views.
const CHROMA = {
  C: [1, 0, 0, 0, 0.9, 0, 0, 0.8, 0, 0, 0, 0], G: [0, 0, 0.8, 0, 0, 0, 0, 1, 0, 0, 0, 0.9],
  Am: [0.9, 0, 0, 0, 0.8, 0, 0, 0, 0, 1, 0, 0], F: [0.9, 0, 0, 0, 0, 1, 0, 0, 0, 0.8, 0, 0],
};
const BASS_MIDI = { C: 36, G: 43, Am: 45, F: 41 };
function legacyAnalysis() {
  const progression = ['C', 'G', 'Am', 'F'];
  const chordCandidates = Array.from({ length: 16 }, (_, beat) => {
    const chord = progression[Math.floor(beat / 4)];
    return { startMs: beat * 600, endMs: (beat + 1) * 600, beatIndex: beat, symbol: chord, isSilence: false, rms: 0.1,
      chroma: CHROMA[chord], bassPeaks: [{ midi: BASS_MIDI[chord], note: chord, strength: 1 }], selectedSymbol: '' };
  });
  chordCandidates[8].selectedSymbol = 'Am7';
  chordCandidates[9].selectedSymbol = 'Am7';
  return {
    durationMs: 9600, bpm: 100, rhythmConfidence: 3, beats: Array.from({ length: 16 }, (_, beat) => beat * 0.6),
    harmonicSegmentationVersion: 5, chordCandidates, spectralFrames: [],
    harmonicRegions: progression.map((chord, index) => ({ startMs: index * 2400, endMs: (index + 1) * 2400, symbol: chord,
      selectedSymbol: index === 0 ? 'C' : '', isSilence: false })),
  };
}
const chords = (analysis) => analysis.harmonicRegions.filter((region) => region.state === 'harmony').map((region) => region.symbol);

test('las elecciones por región y por golpe del motor anterior pasan a restricciones', () => {
  const constraints = legacyChoicesAsConstraints(legacyAnalysis());
  assert.deepEqual(constraints.map(({ startMs, endMs, symbol }) => [startMs, endMs, symbol]), [[0, 2400, 'C'], [4800, 6000, 'Am7']]);
  assert.ok(constraints.every((item) => item.type === 'label' && item.kind === 'edit' && item.migratedFrom === 'v5'));
});

test('migrar un análisis v5 decodifica provisoriamente y conserva cada acorde elegido', () => {
  const analysis = migrateAnalysisToV6(legacyAnalysis());
  assert.equal(analysis.harmony.version, 6);
  assert.equal(isProvisionalHarmony(analysis), true);
  assert.equal(analysis.harmonyMigration.keptChoices, 2);
  assert.equal(analysis.harmonicSegmentationVersion, 6);
  assert.deepEqual(chords(analysis), ['C', 'G', 'Am7', 'Am', 'F']);
  const am7 = analysis.harmonicRegions.find((region) => region.symbol === 'Am7');
  assert.deepEqual([am7.startMs, am7.endMs, am7.source, am7.confirmed], [4800, 6000, 'user', true]);
  assert.deepEqual(analysis.chordSuggestions.map((item) => [item.symbol, item.confirmed]),
    [['C', true], ['G', false], ['Am7', true], ['Am', false], ['F', false]]);
  // The per-beat list now shows the track's answer and no longer carries its own picks.
  assert.equal(analysis.chordCandidates[9].symbol, 'Am7');
  assert.equal(analysis.chordCandidates[10].symbol, 'Am');
  assert.ok(analysis.chordCandidates.every((beat) => beat.selectedSymbol === ''));
  const again = migrateAnalysisToV6(analysis);
  assert.equal(again.harmony, analysis.harmony, 'migrar dos veces no cambia nada');
});

test('editar y cambiar la sensibilidad mantienen todas las vistas sincronizadas', () => {
  const analysis = migrateAnalysisToV6(legacyAnalysis());
  const g = analysis.harmonicRegions.find((region) => region.symbol === 'G');
  editAnalysisHarmony(analysis, { type: 'label', startMs: g.startMs, endMs: g.endMs, symbol: 'G7' });
  assert.equal(analysis.harmonicRegions, analysis.harmony.regions);
  assert.ok(chords(analysis).includes('G7'));
  assert.equal(analysis.chordCandidates[5].symbol, 'G7');
  assert.ok(analysis.chordSuggestions.some((item) => item.symbol === 'G7' && item.confirmed));
  setAnalysisSensitivity(analysis, 'estable');
  assert.equal(analysis.harmony.sensitivity, 'estable');
  assert.ok(chords(analysis).includes('G7'), 'lo corregido sobrevive');
  assert.ok(chords(analysis).includes('Am7'));
});
