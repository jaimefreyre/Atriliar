import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgression } from '../../public/js/harmony/synthProgression.js';
import { computeHarmonyFrames, quantizeHarmonyFrames, dequantizeHarmonyFrames, getChromaExtractor } from '../../public/js/harmony/chromaFrontEnd.js';
import { logFreqSpectrum } from '../../public/js/harmony/nnlsChroma.js';
import { hannWindow } from '../../public/js/harmony/fft.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function meanChroma(frames, key) {
  const from = Math.floor(frames.count * 0.3), to = Math.floor(frames.count * 0.7);
  const out = Array(12).fill(0);
  for (let index = from; index < to; index++) for (let pc = 0; pc < 12; pc++) out[pc] += frames[key][index * 12 + pc];
  const max = Math.max(...out) || 1;
  return out.map((value) => value / max);
}
const top = (chroma, count) => chroma.map((value, pc) => [value, NAMES[pc]]).sort((a, b) => b[0] - a[0]).slice(0, count).map(([, name]) => name).sort();
const framesFor = (spec, options) => { const audio = renderProgression(spec); return computeHarmonyFrames(audio.pcm, audio.sampleRate, options); };

test('el espectro log ubica un La 440 en el bin de su semitono', () => {
  const extractor = getChromaExtractor({ sampleRate: 44100, frameSize: 16384 });
  const window = hannWindow(16384);
  const frame = Float32Array.from({ length: 16384 }, (_, n) => Math.sin((2 * Math.PI * 440 * n) / 44100) * window[n]);
  const log = logFreqSpectrum(extractor.fft.magnitude(frame), extractor.kernel);
  assert.equal(log.indexOf(Math.max(...log)), 3 * (69 - 21) + 1);
});

test('un acorde de C mayor da C, E y G en agudos y C en el bajo', () => {
  const frames = framesFor({ chords: [{ symbol: 'C', beats: 8 }] });
  assert.deepEqual(top(meanChroma(frames, 'treble'), 3), ['C', 'E', 'G']);
  assert.deepEqual(top(meanChroma(frames, 'bass'), 1), ['C']);
});

test('NNLS atenúa el armónico fantasma de una nota sola', () => {
  const spec = { chords: [{ symbol: 'C5', beats: 8, voicing: [48] }], bassPattern: 'none', timbre: 'organ' };
  const withNNLS = meanChroma(framesFor(spec), 'treble');
  const linear = meanChroma(framesFor(spec, { useNNLS: false }), 'treble');
  assert.ok(withNNLS[7] < linear[7], `G con NNLS ${withNNLS[7]} vs sin NNLS ${linear[7]}`);
  assert.ok(withNNLS[7] <= 0.4);
});

test('compensa una grabación desafinada −30 cents', () => {
  const frames = framesFor({ chords: [{ symbol: 'C', beats: 8 }], detuneCents: -30 });
  assert.ok(Math.abs(frames.tuning.cents + 30) <= 5, `afinación estimada ${frames.tuning.cents}`);
  assert.deepEqual(top(meanChroma(frames, 'treble'), 3), ['C', 'E', 'G']);
});

test('separa el bajo del acorde en un slash chord (Am/G)', () => {
  const frames = framesFor({ chords: [{ symbol: 'Am', bass: 'G', beats: 8 }] });
  assert.deepEqual(top(meanChroma(frames, 'bass'), 1), ['G']);
  const treble = top(meanChroma(frames, 'treble'), 4);
  for (const name of ['A', 'C', 'E']) assert.ok(treble.includes(name), `${name} en ${treble}`);
});

test('el silencio no produce croma y su RMS es cero', () => {
  const frames = computeHarmonyFrames(new Float32Array(44100), 44100);
  assert.ok(frames.treble.every((value) => value === 0) && frames.bass.every((value) => value === 0));
  assert.ok(frames.rms.every((value) => value === 0));
});

test('la cuantización a 8 bits conserva la croma con error menor a 1/255 del máximo', () => {
  const frames = framesFor({ chords: [{ symbol: 'G7', beats: 4 }] });
  const restored = dequantizeHarmonyFrames(quantizeHarmonyFrames(frames));
  for (let index = 0; index < frames.count; index++) {
    const max = Math.max(...frames.treble.subarray(index * 12, index * 12 + 12));
    for (let pc = 0; pc < 12; pc++) {
      assert.ok(Math.abs(restored.treble[index * 12 + pc] - frames.treble[index * 12 + pc]) <= max / 255 + 1e-6);
    }
  }
});
