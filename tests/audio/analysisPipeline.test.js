import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEssentiaNode } from '../../scripts/lib/loadEssentiaNode.mjs';
import { analyzeAudio, resampleTo44100 } from '../../public/js/audio/analysisPipeline.js';
import { renderProgression } from '../../public/js/harmony/synthProgression.js';

// The same pipeline the analysis Worker runs, with the vendored Essentia
// loaded in Node: rhythm is detected, not given.

test('el análisis completo detecta tempo, acordes y silencios, y la evidencia por golpe coincide con la pista', async () => {
  const essentia = await loadEssentiaNode();
  const audio = renderProgression({ bpm: 120, chords: [{ symbol: 'C', beats: 4 }, { silence: true, beats: 3 }, { symbol: 'G', beats: 4 },
    { symbol: 'Am', beats: 4 }, { symbol: 'F', beats: 4 }] });
  const stages = [];
  const analysis = analyzeAudio(essentia, { pcm: audio.pcm, sampleRate: audio.sampleRate, onProgress: ({ stage }) => stages.push(stage) });
  assert.ok(Math.abs(analysis.bpm - 120) < 2, `bpm ${analysis.bpm}`);
  assert.equal(analysis.harmony.version, 6);
  assert.deepEqual(analysis.harmonicRegions.filter((region) => region.state === 'harmony').map((region) => region.symbol), ['C', 'G', 'Am', 'F']);
  const pause = analysis.harmonicRegions.find((region) => region.startMs <= 2800 && region.endMs > 2800);
  assert.equal(pause.state, 'silence');
  assert.equal(analysis.chordSuggestions.length, 4);
  assert.ok(analysis.chordSuggestions.every((item) => item.confirmed === false), 'lo automático queda como estimado');
  assert.ok(analysis.spectralFrames.length > 50);
  assert.ok(analysis.chordCandidates.length >= 16);
  for (const beat of analysis.chordCandidates) {
    const middle = (beat.startMs + beat.endMs) / 2;
    const region = analysis.harmonicRegions.find((item) => item.startMs <= middle && item.endMs > middle);
    assert.equal(beat.symbol, region.state === 'harmony' ? region.symbol : null, `golpe ${beat.beatIndex}`);
  }
  assert.deepEqual([...new Set(stages)], ['rhythm', 'peaks', 'harmony', 'done']);
});

test('remuestrea a 44,1 kHz sin cambiar la duración', () => {
  const signal = new Float32Array(48000).fill(0.5);
  const out = resampleTo44100(signal, 48000);
  assert.equal(out.length, 44100);
  assert.equal(out[1000], 0.5);
  assert.equal(resampleTo44100(signal, 44100), signal);
});
