import test from 'node:test';
import assert from 'node:assert/strict';
import { getChordTones } from '../../public/js/music/harmony.js';
import { FAMILIES, FAMILY_COUNT, VARIANTS_BY_MODE, pitchSetKey, formatChordSymbol, familyForSymbol, sameNoteTwins, familyIndex } from '../../public/js/harmony/chordVocabulary.js';
import { estimateKey, diatonicPrior } from '../../public/js/harmony/keyProfile.js';

test('25 familias con conjuntos de notas distintos', () => {
  assert.equal(FAMILIES.length, FAMILY_COUNT);
  const keys = FAMILIES.slice(1).map((family) => pitchSetKey(family.tones));
  assert.equal(new Set(keys).size, 24);
});

test('dentro de cada familia ninguna variante repite conjunto de notas', () => {
  for (const variants of Object.values(VARIANTS_BY_MODE)) {
    const keys = variants.map((variant) => pitchSetKey(variant.intervals));
    assert.equal(new Set(keys).size, variants.length);
  }
});

test('el nombre generado vuelve a leerse con las mismas notas', () => {
  for (const [mode, variants] of Object.entries(VARIANTS_BY_MODE)) {
    for (const variant of variants) {
      for (const root of [0, 3, 7, 10]) {
        const symbol = formatChordSymbol({ root, quality: variant.quality });
        const chord = getChordTones(symbol);
        assert.equal(chord.rootPitchClass, root, `${mode} ${symbol}`);
        assert.equal(pitchSetKey(chord.tones), pitchSetKey(variant.intervals.map((interval) => root + interval)), symbol);
      }
    }
  }
});

test('ortografía según la tonalidad y bajo en slash', () => {
  assert.equal(formatChordSymbol({ root: 10, quality: '' }), 'A#');
  assert.equal(formatChordSymbol({ root: 10, quality: '', key: { tonic: 5, mode: 'maj' } }), 'Bb');
  assert.equal(formatChordSymbol({ root: 9, quality: 'm', bassPitchClass: 7 }), 'Am/G');
  assert.equal(formatChordSymbol({ root: 0, quality: '', bassPitchClass: 0 }), 'C');
});

test('familia de cualquier símbolo y gemelos de mismas notas', () => {
  assert.equal(familyForSymbol('Am7'), familyIndex(9, 'min'));
  assert.equal(familyForSymbol('Bdim'), familyIndex(11, 'min'));
  assert.equal(familyForSymbol('Csus4'), familyIndex(0, 'maj'));
  assert.equal(familyForSymbol('C/E'), familyIndex(0, 'maj'));
  assert.equal(familyForSymbol('N'), 0);
  assert.ok(sameNoteTwins(0, '6').some((twin) => twin.root === 9 && twin.quality === 'm7'), 'C6 = Am7');
  assert.ok(sameNoteTwins(0, 'sus2').some((twin) => twin.root === 7 && twin.quality === 'sus4'), 'Csus2 = Gsus4');
  assert.equal(sameNoteTwins(0, 'dim7').filter((twin) => twin.quality === 'dim7').length, 3);
});

test('estima la tonalidad y arma un prior diatónico suave', () => {
  const chroma = (tones) => Array.from({ length: 12 }, (_, pc) => (tones.includes(pc) ? 1 : 0.05));
  const steps = [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]].map((tones) => ({ treble: chroma(tones), bass: chroma([tones[0]]), durationMs: 2000 }));
  const key = estimateKey(steps);
  assert.equal(key.tonic, 0);
  assert.equal(key.mode, 'maj');
  const prior = diatonicPrior(key, 0.5);
  assert.equal(prior[familyIndex(7, 'maj')], 0.5);
  assert.equal(prior[familyIndex(10, 'maj')], 0);
  assert.equal(prior[familyIndex(1, 'maj')], -0.25);
  assert.equal(prior[0], 0);
});
