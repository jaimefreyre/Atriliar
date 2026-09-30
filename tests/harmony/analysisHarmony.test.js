import test from 'node:test';
import assert from 'node:assert/strict';
import { editAnalysisHarmony, setAnalysisSensitivity, syncAnalysisViews } from '../../public/js/harmony/analysisHarmony.js';
import { computeHarmonyFrames } from '../../public/js/harmony/chromaFrontEnd.js';
import { buildHarmonyTrack } from '../../public/js/harmony/harmonyTrack.js';
import { renderProgression } from '../../public/js/harmony/synthProgression.js';

function currentAnalysis() {
  const audio = renderProgression({ bpm: 100, chords: [{ symbol: 'C', beats: 4 }, { symbol: 'G', beats: 4 }] });
  const analysis = {
    durationMs: audio.durationMs,
    bpm: audio.bpm,
    beats: audio.beatTimesSec,
    chordCandidates: audio.beatTimesSec.slice(0, -1).map((startSec, index) => ({
      startMs: Math.round(startSec * 1000), endMs: Math.round(audio.beatTimesSec[index + 1] * 1000), selectedSymbol: '',
    })),
    harmony: buildHarmonyTrack({ frames: computeHarmonyFrames(audio.pcm, audio.sampleRate), beatsSec: audio.beatTimesSec,
      bpm: audio.bpm, durationMs: audio.durationMs }),
  };
  return syncAnalysisViews(analysis);
}

test('editar y cambiar sensibilidad mantienen la pista actual sincronizada', () => {
  const analysis = currentAnalysis();
  const first = analysis.harmony.regions.find((region) => region.state === 'harmony');
  editAnalysisHarmony(analysis, { type: 'label', startMs: first.startMs, endMs: first.endMs, symbol: 'C7' });
  assert.equal(analysis.harmonicRegions, analysis.harmony.regions);
  assert.ok(analysis.harmonicRegions.some((region) => region.symbol === 'C7'));
  assert.ok(analysis.chordSuggestions.some((item) => item.symbol === 'C7' && item.confirmed));
  assert.ok(analysis.chordCandidates.some((beat) => beat.symbol === 'C7'));
  setAnalysisSensitivity(analysis, 'estable');
  assert.equal(analysis.harmony.sensitivity, 'estable');
  assert.ok(analysis.harmonicRegions.some((region) => region.symbol === 'C7'), 'la corrección permanece en la pista actual');
});

test('la vista sincronizada no inventa una pista armónica para objetos sin el modelo actual', () => {
  const previousShape = { chordCandidates: [{ symbol: 'C', selectedSymbol: 'Am' }] };
  assert.equal(syncAnalysisViews(previousShape), previousShape);
  assert.equal(previousShape.harmony, undefined);
});
