// Synthetic evaluation fixtures with a known answer key. Each one targets a
// failure mode behind "cambia muchísimo" or "no detecta muchos cambios".
// `gates` are the minimum scores the Normal preset must reach.

const bars = (symbols, beats = 4, extra = {}) => symbols.map((symbol) => ({ symbol, beats, ...extra }));

export const FIXTURES = [
  {
    id: 'pop4', quick: true, notes: 'C–G–Am–F, un acorde por compás, 100 BPM',
    spec: { bpm: 100, chords: bars(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']) },
    gates: { majmin: 0.92, boundaryF1: 0.9 },
  },
  {
    id: 'fast', notes: 'cambios cada 2 pulsos y un acorde de paso de 1 pulso, 120 BPM',
    spec: { bpm: 120, chords: [
      { symbol: 'C', beats: 2 }, { symbol: 'G', bass: 'B', beats: 2 }, { symbol: 'Am', beats: 2 }, { symbol: 'G', beats: 2 },
      { symbol: 'F', beats: 2 }, { symbol: 'C', bass: 'E', beats: 2 }, { symbol: 'Dm', beats: 2 }, { symbol: 'G', beats: 1 }, { symbol: 'G7', beats: 1 },
      { symbol: 'C', beats: 4 }] },
    gates: { majmin: 0.8 },
  },
  {
    id: 'pedal', quick: true, notes: 'acordes que cambian sobre un pedal de C en el bajo',
    spec: { bpm: 100, chords: [{ symbol: 'C', beats: 4 }, { symbol: 'F', bass: 'C', beats: 4 }, { symbol: 'G', bass: 'C', beats: 4 }, { symbol: 'C', beats: 4 },
      { symbol: 'F', bass: 'C', beats: 4 }, { symbol: 'G', bass: 'C', beats: 4 }, { symbol: 'C', beats: 4 }] },
    gates: { boundaryRecall: 0.9, majmin: 0.85 },
  },
  {
    id: 'walking', quick: true, notes: 'un solo C con bajo fundamental-quinta y después caminante: no debe partirse',
    spec: { bpm: 110, chords: [...bars(['C', 'C', 'C', 'C'], 4, { bassPattern: 'root-fifth' }), ...bars(['C', 'C', 'C', 'C'], 4, { bassPattern: 'walking' }), { symbol: 'F', beats: 4 }] },
    gates: { majmin: 0.9, overSegmentation: 0.95, changesPerMinuteRatio: 1.1 },
  },
  {
    id: 'descending', quick: true, notes: 'bajo descendente sostenido: Am – Am/G – Am/F# – Fmaj7',
    spec: { bpm: 90, chords: [{ symbol: 'Am', beats: 4 }, { symbol: 'Am', bass: 'G', beats: 4 }, { symbol: 'Am', bass: 'F#', beats: 4 }, { symbol: 'Fmaj7', beats: 4 },
      { symbol: 'Am', beats: 4 }, { symbol: 'Am', bass: 'G', beats: 4 }, { symbol: 'Am', bass: 'F#', beats: 4 }, { symbol: 'Fmaj7', beats: 4 }] },
    gates: { majminInv: 0.75 },
  },
  {
    id: 'colors', quick: true, notes: 'sus, séptimas y un cliché C–Cmaj7–C7–C6',
    spec: { bpm: 100, chords: [{ symbol: 'Csus4', beats: 2 }, { symbol: 'C', beats: 2 }, ...bars(['G7', 'Cmaj7', 'Am7', 'Dm7', 'E7', 'Am', 'C', 'Cmaj7', 'C7', 'C6'])] },
    gates: { sevenths: 0.8, majmin: 0.85 },
  },
  {
    id: 'silence', quick: true, notes: 'pausas de 1,5 s y un corte de 1 pulso',
    spec: { bpm: 120, chords: [{ symbol: 'C', beats: 4 }, { silence: true, beats: 3 }, { symbol: 'G', beats: 4 }, { silence: true, beats: 1 },
      { symbol: 'Am', beats: 4 }, { symbol: 'F', beats: 4 }] },
    gates: { noChordRecall: 0.9, majmin: 0.85 },
  },
  {
    id: 'detuned-30', quick: true, notes: 'pop4 desafinado −30 cents',
    spec: { bpm: 100, detuneCents: -30, chords: bars(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']) },
    gates: { majmin: 0.9 },
  },
  {
    id: 'detuned+40', notes: 'pop4 desafinado +40 cents',
    spec: { bpm: 100, detuneCents: 40, chords: bars(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']) },
    gates: { majmin: 0.9 },
  },
  {
    id: 'melody', quick: true, notes: 'C sostenido con una melodía en corcheas encima, después G',
    spec: { bpm: 100, melody: { level: 0.8 }, chords: [...bars(['C', 'C', 'C', 'C']), ...bars(['G', 'G', 'G', 'G'])] },
    gates: { majmin: 0.85, spuriousPerMinute: 2 },
  },
  {
    id: 'drums-intro', notes: '4 compases solo de batería y después acordes con batería',
    spec: { bpm: 110, leadInBeats: 16, drums: { level: 0.55 }, chords: bars(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']) },
    gates: { majmin: 0.85, spuriousPerMinute: 2 },
  },
  {
    id: 'rubato', notes: 'pads con tempo que oscila entre 70 y 90',
    spec: { bpm: 80, timbre: 'pad', tempoCurve: (beat) => 80 + 10 * Math.sin(beat / 3), chords: bars(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']) },
    gates: { majmin: 0.85 },
  },
  {
    id: 'power', notes: 'power chords saturados',
    spec: { bpm: 120, timbre: 'power', chords: bars(['C5', 'G5', 'A5', 'F5', 'C5', 'G5', 'A5', 'F5']) },
    gates: { root: 0.85 },
  },
  {
    id: 'anticipation', notes: 'pop4 con los cambios medio pulso antes',
    spec: { bpm: 90, anticipationBeats: 0.5, chords: bars(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']) },
    gates: { majmin: 0.85 },
  },
  {
    id: 'demo', quick: true, notes: 'la canción demo del contrato (Camino de luz, 16 compases)',
    spec: { bpm: 120, chords: bars(['C', 'Am', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'C']) },
    gates: { majmin: 0.92, boundaryF1: 0.9 },
  },
];

/** Check one fixture's metrics against its gates; returns the failed gates. */
export function failedGates(fixture, metrics) {
  const failures = [];
  const { gates } = fixture;
  const check = (name, value, min) => { if (value === null || value === undefined || value < min) failures.push(`${name} ${value?.toFixed?.(3) ?? value} < ${min}`); };
  if (gates.majmin !== undefined) check('majmin', metrics.wcsr.majmin, gates.majmin);
  if (gates.majminInv !== undefined) check('majminInv', metrics.wcsr.majminInv, gates.majminInv);
  if (gates.sevenths !== undefined) check('sevenths', metrics.wcsr.sevenths, gates.sevenths);
  if (gates.root !== undefined) check('root', metrics.wcsr.root, gates.root);
  if (gates.boundaryF1 !== undefined) check('boundaryF1', metrics.boundary.f1, gates.boundaryF1);
  if (gates.boundaryRecall !== undefined) check('boundaryRecall', metrics.boundary.recall, gates.boundaryRecall);
  if (gates.overSegmentation !== undefined) check('overSegmentation', metrics.overSegmentation, gates.overSegmentation);
  if (gates.noChordRecall !== undefined) check('noChordRecall', metrics.noChordRecall, gates.noChordRecall);
  if (gates.changesPerMinuteRatio !== undefined) {
    const ratio = metrics.changesPerMinute.estimate / Math.max(1e-9, metrics.changesPerMinute.reference);
    if (ratio > gates.changesPerMinuteRatio) failures.push(`cambios/min ${ratio.toFixed(2)}× > ${gates.changesPerMinuteRatio}×`);
  }
  if (gates.spuriousPerMinute !== undefined) {
    const perMinute = metrics.boundary.spurious / Math.max(1e-9, metrics.durationMs / 60000);
    if (perMinute > gates.spuriousPerMinute) failures.push(`espurios/min ${perMinute.toFixed(2)} > ${gates.spuriousPerMinute}`);
  }
  return failures;
}
