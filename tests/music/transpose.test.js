import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, transposeKey } from '../../public/js/music/transpose.js';

// Casos históricos de tests/musicEngine.test.js (S2 los reemplaza importando
// el módulo de producción real en vez de una copia del algoritmo).
const LEGACY_CASES = [
  { input: 'F#', semitones: 2, expected: 'G#' },
  { input: 'F#7M', semitones: 2, expected: 'G#7M' },
  { input: 'F#7M(9,#5)', semitones: 2, expected: 'G#7M(9,#5)' },
  { input: 'F#7M(9,#5)/A#', semitones: 2, expected: 'G#7M(9,#5)/C' },
  { input: 'C#m7(b5)', semitones: -1, expected: 'Cm7(b5)' },
  { input: 'D/F#', semitones: 2, expected: 'E/G#' },
  { input: 'Bb7M(9)', semitones: 1, expected: 'B7M(9)' },
];

for (const { input, semitones, expected } of LEGACY_CASES) {
  test(`transposeChord(${input}, ${semitones}) === ${expected}`, () => {
    assert.equal(transposeChord(input, semitones), expected);
  });
}

test('transposición negativa grande nunca produce "undefined"', () => {
  const result = transposeChord('C', -13);
  assert.equal(result, 'B');
  assert.ok(!result.includes('undefined'));
});

test('transposición positiva grande (+13, +24) da resultados válidos', () => {
  assert.equal(transposeChord('C', 24), 'C'); // dos octavas, vuelve a C
  assert.equal(transposeChord('C', 13), 'C#'); // octava + semitono
});

test('roundtrip: transponer y volver dejan el mismo acorde', () => {
  for (const symbol of ['C', 'F#m7', 'Bbmaj7', 'C#m7(b5)', 'G7sus4']) {
    for (const n of [1, 5, 11, -3, -13, 17]) {
      const there = transposeChord(symbol, n);
      const back = transposeChord(there, -n);
      assert.equal(transposeChord(back, 0), transposeChord(symbol, 0), `${symbol} +${n}/-${n}`);
    }
  }
});

test('tonalidades menores transponen (bug histórico: "Em" quedaba sin cambios)', () => {
  assert.equal(transposeKey('Em', 2), 'F#m');
  assert.equal(transposeKey('Am', -1), 'G#m');
});

test('tonalidades mayores transponen sin arrastrar sufijo', () => {
  assert.equal(transposeKey('C', 2), 'D');
  assert.equal(transposeKey('Bb', 1), 'B');
});

test('una tonalidad no reconocible se devuelve sin cambios', () => {
  assert.equal(transposeKey('H', 2), 'H');
  assert.equal(transposeKey('', 2), '');
});
