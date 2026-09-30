import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMidiVoices, midiRegisterFor, selectMidiPlaybackEvents } from '../../public/js/audio/midiVoices.js';

test('convierte picos MIDI en tres líneas temporales y prolonga alturas repetidas', () => {
  const frames = [
    { timeMs: 0, peaks: [{ midi: 40, strength: .9 }, { midi: 60, strength: .7 }, { midi: 76, strength: .8 }] },
    { timeMs: 100, peaks: [{ midi: 40, strength: .8 }, { midi: 62, strength: .9 }, { midi: 77, strength: .7 }] },
    { timeMs: 200, peaks: [{ midi: 43, strength: .8 }, { midi: 63, strength: .7 }, { midi: 78, strength: .6 }] },
  ];
  const tracks = extractMidiVoices(frames, { startMs: 0, endMs: 300 });
  assert.deepEqual(Object.keys(tracks), ['bass', 'middle', 'high']);
  assert.deepEqual(tracks.bass.map((note) => note.midi), [40, 43]);
  assert.equal(tracks.bass[0].endMs, 200);
  assert.deepEqual(tracks.middle.map((note) => note.midi), [60, 62, 63]);
  assert.deepEqual(tracks.high.map((note) => note.midi), [76, 77, 78]);
});

test('una nota manual reemplaza el pico cercano de su registro y se puede ubicar por registro', () => {
  const tracks = extractMidiVoices([{ timeMs: 500, peaks: [{ midi: 40, strength: 1 }, { midi: 60, strength: 1 }] }], {
    startMs: 0, endMs: 1200,
    manualNotes: [{ id: 'manual-1', timeMs: 520, midi: 42 }],
  });
  assert.deepEqual(tracks.bass.map((note) => [note.midi, note.source]), [[42, 'manual']]);
  assert.equal(midiRegisterFor(40), 'bass');
  assert.equal(midiRegisterFor(60), 'middle');
  assert.equal(midiRegisterFor(78), 'high');
});

test('suaviza un pico aislado y une una pérdida de un cuadro sin agregar golpes MIDI', () => {
  const frames = [
    { timeMs: 0, level: .8, peaks: [{ midi: 40, strength: .62 }] },
    { timeMs: 100, level: .7, peaks: [{ midi: 40, strength: .6 }] },
    { timeMs: 200, level: .9, peaks: [{ midi: 47, strength: .72 }] }, // armónico/transitorio aislado
    { timeMs: 300, level: .65, peaks: [{ midi: 40, strength: .61 }] },
    { timeMs: 400, level: .6, peaks: [] }, // cuadro perdido por el umbral
    { timeMs: 500, level: .55, peaks: [{ midi: 40, strength: .58 }] },
  ];
  const tracks = extractMidiVoices(frames, { startMs: 0, endMs: 600 });
  assert.deepEqual(tracks.bass.map((note) => note.midi), [40]);
  assert.equal(tracks.bass[0].startMs, 0);
  assert.equal(tracks.bass[0].endMs, 600);
  assert.ok(tracks.bass[0].level > .6 && tracks.bass[0].level < .8);
  assert.deepEqual(tracks.bass[0].levels.map((point) => point.timeMs), [0, 100, 200, 300, 400, 500]);
});

test('recupera una envolvente aproximada de los proyectos guardados antes del RMS por cuadro', () => {
  const tracks = extractMidiVoices([
    { timeMs: 0, peaks: [{ midi: 40, strength: .8 }] },
    { timeMs: 100, peaks: [{ midi: 40, strength: .8 }] },
  ], { startMs: 0, endMs: 200, waveform: [.1, .5, .9, .5], durationMs: 200 });
  assert.ok(tracks.bass[0].levels[0].level < tracks.bass[0].levels[1].level);
});

test('la reproducción total conserva eventos a través de fronteras de tramos y permite filtrar una voz', () => {
  const tracks = {
    bass: [{ startMs: 0, endMs: 450, midi: 40, register: 'bass' }, { startMs: 650, endMs: 900, midi: 43, register: 'bass' }],
    middle: [{ startMs: 420, endMs: 700, midi: 60, register: 'middle' }],
    high: [{ startMs: 500, endMs: 750, midi: 76, register: 'high' }],
  };
  const wholePiece = selectMidiPlaybackEvents(tracks, { startMs: 0, endMs: 1000, mode: 'all' });
  assert.deepEqual(wholePiece.map((event) => event.midi), [40, 60, 76, 43]);
  const selectedVoice = selectMidiPlaybackEvents(tracks, { startMs: 0, endMs: 1000, mode: 'line', register: 'bass' });
  assert.deepEqual(selectedVoice.map((event) => event.midi), [40, 43]);
});
