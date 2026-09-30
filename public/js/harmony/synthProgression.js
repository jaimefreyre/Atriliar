import { getChordTones } from '../music/harmony.js';

// Deterministic additive synthesis of chord progressions with an exact
// answer key (beats and chord spans). Test and evaluation material only:
// it lets the harmony engine be measured on "cambia muchísimo" vs "no
// detecta cambios" without real recordings leaving the machine.

const TIMBRES = {
  piano: { harmonics: [1, 0.55, 0.32, 0.22, 0.14, 0.1, 0.07, 0.05], decaySec: 1.6, attackSec: 0.005 },
  pad: { harmonics: [1, 0.35, 0.18, 0.08, 0.04], decaySec: 30, attackSec: 0.06 },
  organ: { harmonics: [1, 0.8, 0.6, 0.3, 0.2, 0.15], decaySec: 30, attackSec: 0.01 },
  power: { harmonics: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3], decaySec: 4, attackSec: 0.004, clip: 0.55 },
  bass: { harmonics: [1, 0.6, 0.25, 0.12, 0.06], decaySec: 1.2, attackSec: 0.008 },
  lead: { harmonics: [1, 0.3, 0.15, 0.05], decaySec: 3, attackSec: 0.02 },
};

function prng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const midiToHz = (midi, detuneCents = 0) => 440 * 2 ** ((midi - 69 + detuneCents / 100) / 12);

function addNote(buffer, sampleRate, { midi, startSec, durationSec, level, timbre, detuneCents }) {
  const shape = TIMBRES[timbre] || TIMBRES.piano;
  const start = Math.max(0, Math.round(startSec * sampleRate));
  const releaseSec = 0.03;
  const end = Math.min(buffer.length, Math.round((startSec + durationSec + releaseSec) * sampleRate));
  if (end <= start) return;
  const f0 = midiToHz(midi, detuneCents);
  const attack = Math.max(1, shape.attackSec * sampleRate);
  const noteEnd = (startSec + durationSec) * sampleRate;
  const decayPerSample = Math.exp(-1 / (shape.decaySec * sampleRate));
  shape.harmonics.forEach((amplitude, index) => {
    const frequency = f0 * (index + 1);
    if (frequency >= sampleRate / 2 - 100) return;
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const k = 2 * Math.cos(omega);
    let previous = Math.sin(-omega);
    let current = 0;
    let decay = 1;
    for (let sample = start; sample < end; sample++) {
      const offset = sample - start;
      const attackGain = offset < attack ? offset / attack : 1;
      const releaseGain = sample > noteEnd ? Math.max(0, 1 - (sample - noteEnd) / (releaseSec * sampleRate)) : 1;
      buffer[sample] += current * amplitude * level * attackGain * releaseGain * decay;
      const next = k * current - previous;
      previous = current;
      current = next;
      decay *= decayPerSample;
    }
  });
}

function addNoise(buffer, sampleRate, random, { startSec, durationSec, level, color }) {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(buffer.length, Math.round((startSec + durationSec) * sampleRate));
  let low = 0;
  for (let sample = Math.max(0, start); sample < end; sample++) {
    const envelope = Math.exp(-(sample - start) / (durationSec * sampleRate * 0.3));
    const white = random() * 2 - 1;
    low += (white - low) * (color === 'dark' ? 0.08 : 0.6);
    buffer[sample] += (color === 'dark' ? low : white - low) * level * envelope;
  }
}

function addKick(buffer, sampleRate, startSec, level) {
  const start = Math.round(startSec * sampleRate);
  const length = Math.round(0.15 * sampleRate);
  let phase = 0;
  for (let offset = 0; offset < length && start + offset < buffer.length; offset++) {
    const t = offset / sampleRate;
    const frequency = 50 + 70 * Math.exp(-t * 30);
    phase += (2 * Math.PI * frequency) / sampleRate;
    buffer[start + offset] += Math.sin(phase) * level * Math.exp(-t * 18);
  }
}

function voicing(symbol, register = 60) {
  const chord = getChordTones(symbol);
  const root = chord.rootPitchClass;
  const intervals = [...new Set(chord.tones.map((tone) => (tone - root + 12) % 12))].sort((a, b) => a - b);
  const base = register + ((root - (register % 12) + 12) % 12);
  return { root, bass: Number.isInteger(chord.bassPitchClass) ? chord.bassPitchClass : root, tones: chord.tones,
    notes: intervals.map((interval) => base + interval) };
}

function fifthOf(pitchClass) { return (pitchClass + 7) % 12; }
function thirdOf(symbol, root) {
  const tones = getChordTones(symbol).tones;
  return tones.includes((root + 3) % 12) ? (root + 3) % 12 : (root + 4) % 12;
}
const bassMidi = (pitchClass, low = 36) => low + ((pitchClass - (low % 12) + 12) % 12);

/**
 * @param {object} spec
 * @param {Array<{symbol?:string, beats:number, bass?:string, silence?:boolean, voicing?:number[]}>} spec.chords
 * @returns {{pcm:Float32Array, sampleRate:number, durationMs:number, beatTimesSec:number[], reference:Array<{startMs:number,endMs:number,symbol:string}>, bpm:number}}
 */
export function renderProgression({
  chords, sampleRate = 44100, bpm = 120, beatsPerBar = 4, seed = 1, timbre = 'piano',
  bassPattern = 'held', pedal = null, melody = null, drums = null, leadInBeats = 0,
  detuneCents = 0, anticipationBeats = 0, tempoCurve = null, chordLevel = 0.32, bassLevel = 0.45,
}) {
  const random = prng(seed);
  const totalBeats = leadInBeats + chords.reduce((sum, chord) => sum + chord.beats, 0);
  const beatTimesSec = [0];
  for (let beat = 1; beat <= totalBeats; beat++) {
    const localBpm = tempoCurve ? tempoCurve(beat - 1) : bpm;
    beatTimesSec.push(beatTimesSec[beat - 1] + 60 / localBpm);
  }
  const durationSec = beatTimesSec[totalBeats] + 0.25;
  const pcm = new Float32Array(Math.ceil(durationSec * sampleRate));
  const beatSec = (beat) => {
    const whole = Math.floor(beat);
    const next = beatTimesSec[Math.min(whole + 1, totalBeats)];
    return beatTimesSec[whole] + (next - beatTimesSec[whole]) * (beat - whole);
  };
  const reference = [];
  if (leadInBeats) reference.push({ startMs: 0, endMs: Math.round(beatSec(leadInBeats - anticipationBeats) * 1000), symbol: 'N' });

  let beat = leadInBeats;
  chords.forEach((chord, index) => {
    const changeBeat = Math.max(0, beat - (index === 0 ? 0 : anticipationBeats));
    const endBeat = beat + chord.beats - (index === chords.length - 1 ? 0 : anticipationBeats);
    const startSec = beatSec(changeBeat);
    const endSec = beatSec(Math.min(totalBeats, endBeat));
    const symbol = chord.silence ? 'N' : chord.bass ? `${chord.symbol}/${chord.bass}` : chord.symbol;
    const last = reference.at(-1);
    if (last && last.symbol === symbol) last.endMs = Math.round(endSec * 1000);
    else reference.push({ startMs: Math.round(startSec * 1000), endMs: Math.round(endSec * 1000), symbol });
    if (!chord.silence) {
      const voiced = voicing(chord.symbol);
      const notes = chord.voicing || voiced.notes;
      const gap = 0.02;
      if (timbre === 'piano') {
        // Re-strike each bar like an accompaniment, not one endless sustain.
        for (let at = changeBeat; at < endBeat - 1e-6; at += beatsPerBar / 2) {
          const until = Math.min(endBeat, at + beatsPerBar / 2);
          notes.forEach((midi) => addNote(pcm, sampleRate, { midi, startSec: beatSec(at), durationSec: beatSec(until) - beatSec(at) - gap,
            level: chordLevel * (0.9 + random() * 0.2), timbre, detuneCents }));
        }
      } else {
        notes.forEach((midi) => addNote(pcm, sampleRate, { midi, startSec, durationSec: endSec - startSec - gap, level: chordLevel, timbre, detuneCents }));
      }
      const slashBass = chord.bass ? getChordTones(`C/${chord.bass}`).bassPitchClass : null;
      const root = voiced.root;
      const pattern = chord.bass ? 'held' : pedal !== null ? 'pedal' : chord.bassPattern || bassPattern;
      if (pattern === 'held' || pattern === 'pedal') {
        const pitchClass = pattern === 'pedal' ? pedal : (slashBass ?? voiced.bass);
        addNote(pcm, sampleRate, { midi: bassMidi(pitchClass), startSec, durationSec: endSec - startSec - gap, level: bassLevel, timbre: 'bass', detuneCents });
      } else if (pattern !== 'none') {
        for (let step = 0; step < chord.beats; step++) {
          const at = beat + step;
          if (at < changeBeat || at >= endBeat) continue;
          let pitchClass = root;
          if (pattern === 'root-fifth') pitchClass = step % 2 === 0 ? root : fifthOf(root);
          if (pattern === 'walking') {
            const nextRoot = chords[index + 1]?.symbol ? voicing(chords[index + 1].symbol).root : root;
            pitchClass = [root, thirdOf(chord.symbol, root), fifthOf(root), (nextRoot + 11) % 12][step % 4];
          }
          addNote(pcm, sampleRate, { midi: bassMidi(pitchClass), startSec: beatSec(at), durationSec: beatSec(at + 1) - beatSec(at) - gap,
            level: bassLevel, timbre: 'bass', detuneCents });
        }
      }
    }
    beat += chord.beats;
  });

  if (melody) {
    const scale = [0, 2, 4, 5, 7, 9, 11];
    for (let step = leadInBeats * 2; step < totalBeats * 2; step++) {
      const midi = 72 + scale[Math.floor(random() * scale.length)];
      addNote(pcm, sampleRate, { midi, startSec: beatSec(step / 2), durationSec: beatSec(step / 2 + 0.5) - beatSec(step / 2) - 0.02,
        level: chordLevel * (melody.level ?? 0.8), timbre: 'lead', detuneCents });
    }
  }
  if (drums) {
    const level = drums.level ?? 0.5;
    for (let step = 0; step < totalBeats * 2; step++) {
      const at = beatSec(step / 2);
      if (step % 2 === 0 && (step / 2) % 2 === 0) addKick(pcm, sampleRate, at, level);
      if (step % 2 === 0 && (step / 2) % 2 === 1) addNoise(pcm, sampleRate, random, { startSec: at, durationSec: 0.12, level: level * 0.6, color: 'bright' });
      addNoise(pcm, sampleRate, random, { startSec: at, durationSec: 0.03, level: level * 0.2, color: 'bright' });
    }
  }
  if (TIMBRES[timbre]?.clip) {
    const threshold = TIMBRES[timbre].clip;
    for (let index = 0; index < pcm.length; index++) pcm[index] = Math.max(-threshold, Math.min(threshold, pcm[index]));
  }
  let peak = 0;
  for (let index = 0; index < pcm.length; index++) peak = Math.max(peak, Math.abs(pcm[index]));
  if (peak > 0) for (let index = 0; index < pcm.length; index++) pcm[index] *= 0.707 / peak;
  const durationMs = Math.round((pcm.length / sampleRate) * 1000);
  // The release tail after the last beat is silence: "no chord" in the answer key.
  const lastEnd = reference.at(-1).endMs;
  if (durationMs - lastEnd >= 100 && reference.at(-1).symbol !== 'N') reference.push({ startMs: lastEnd, endMs: durationMs, symbol: 'N' });
  else reference.at(-1).endMs = durationMs;
  return { pcm, sampleRate, durationMs, beatTimesSec: beatTimesSec.slice(0, totalBeats + 1), reference, bpm };
}

/** 16-bit PCM WAV, mono — for listening to fixtures or loading them in the browser harness. */
export function encodeWav16(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index++) view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, pcm[index])) * 32767, true);
  return new Uint8Array(buffer);
}
