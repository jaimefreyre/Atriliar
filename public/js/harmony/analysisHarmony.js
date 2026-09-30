import { buildHarmonyTrack, redecodeHarmony, applyUserEdit, regionsForSong, HARMONY_VERSION } from './harmonyTrack.js';

// Bridge between the v6 harmony track and the analysis object the current
// lab screens read. The track is the only chord answer; harmonicRegions,
// chordSuggestions and the chord on each beat's evidence are views of it, so
// the "tramos" and "por golpe" lists can never contradict each other again.

const regionAt = (regions, timeMs) => regions.find((region) => region.startMs <= timeMs && region.endMs > timeMs) || null;

/** Recompute every derived view after the track changed. Mutates and returns `analysis`. */
export function syncAnalysisViews(analysis) {
  const track = analysis?.harmony;
  if (!track) return analysis;
  analysis.harmonicRegions = track.regions;
  analysis.harmonicSegmentationVersion = HARMONY_VERSION;
  analysis.chordSuggestions = regionsForSong(track).map(({ symbol, startMs, endMs, confirmed }) => ({ symbol, startMs, endMs, confirmed }));
  for (const beat of analysis.chordCandidates || []) {
    const region = regionAt(track.regions, (beat.startMs + beat.endMs) / 2);
    beat.symbol = region?.state === 'harmony' ? region.symbol : null;
    beat.state = beat.symbol ? 'harmony' : beat.isSilence ? 'silence' : 'no-chord';
    beat.regionId = region?.id ?? null;
    beat.confidence = region?.confidence ?? 0;
    beat.alternatives = region?.alternatives || [];
    beat.accepted = region?.state === 'harmony';
    beat.selectedSymbol = '';
  }
  return analysis;
}

/** Apply one musician edit (see applyUserEdit) and refresh the views. */
export function editAnalysisHarmony(analysis, edit) {
  analysis.harmony = applyUserEdit(analysis.harmony, edit);
  return syncAnalysisViews(analysis);
}

/** Re-decode with another "Sensibilidad de cambios"; the musician's decisions stay. */
export function setAnalysisSensitivity(analysis, sensitivity) {
  analysis.harmony = redecodeHarmony(analysis.harmony, { sensitivity });
  return syncAnalysisViews(analysis);
}

/** Chords the musician decided, as label constraints, from a pre-v6 analysis. */
export function legacyChoicesAsConstraints(analysis) {
  const createdAt = new Date().toISOString();
  const constraint = (id, startMs, endMs, symbol) => ({ id, type: 'label', kind: 'edit', startMs, endMs, symbol, createdAt, migratedFrom: 'v5' });
  const regionChoices = (analysis.harmonicRegions || [])
    .filter((region) => !region.isSilence && region.selectedSymbol && region.endMs > region.startMs)
    .map((region, index) => constraint(`hc-v5-region-${index}`, region.startMs, region.endMs, region.selectedSymbol));
  // Per-beat picks were made in the default view and never reached the song:
  // contiguous beats with the same pick become one span.
  const beatChoices = [];
  for (const beat of analysis.chordCandidates || []) {
    if (beat.isSilence || !beat.selectedSymbol || !(beat.endMs > beat.startMs)) continue;
    const last = beatChoices.at(-1);
    if (last && last.symbol === beat.selectedSymbol && Math.abs(last.endMs - beat.startMs) <= 1) last.endMs = beat.endMs;
    else beatChoices.push(constraint(`hc-v5-beat-${beatChoices.length}`, beat.startMs, beat.endMs, beat.selectedSymbol));
  }
  return [...regionChoices, ...beatChoices];
}

const MIGRATION_HOP_SIZE = 2048;
const MIGRATION_SAMPLE_RATE = 44100;

/**
 * Pseudo-frames from the per-beat chroma a pre-v6 analysis stored (Essentia
 * HPCP, C-based) and its bass peaks, laid on the v6 frame clock.
 */
function framesFromLegacyBeats(analysis) {
  const hopMs = (MIGRATION_HOP_SIZE / MIGRATION_SAMPLE_RATE) * 1000;
  const count = Math.max(1, Math.ceil(analysis.durationMs / hopMs));
  const treble = new Float32Array(count * 12), bass = new Float32Array(count * 12), rms = new Float32Array(count);
  const beats = [...(analysis.chordCandidates || [])].filter((beat) => beat.endMs > beat.startMs).sort((a, b) => a.startMs - b.startMs);
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    const timeMs = index * hopMs;
    while (cursor < beats.length - 1 && beats[cursor].endMs <= timeMs) cursor++;
    const beat = beats[cursor];
    if (!beat || beat.isSilence || timeMs < beat.startMs || timeMs >= beat.endMs) continue;
    (beat.chroma || []).forEach((value, pc) => { treble[index * 12 + pc] = Math.max(0, Number(value) || 0); });
    for (const peak of beat.bassPeaks || []) {
      if (Number.isFinite(peak.midi)) bass[index * 12 + (((Math.round(peak.midi) % 12) + 12) % 12)] += Math.max(0, Number(peak.strength) || 0);
    }
    rms[index] = Number.isFinite(beat.rms) && beat.rms > 0 ? beat.rms : 0.05;
  }
  return { sampleRate: MIGRATION_SAMPLE_RATE, frameSize: 16384, hopSize: MIGRATION_HOP_SIZE, hopMs, count, treble, bass, rms,
    tuning: { bins: 0, cents: 0, referenceHz: 440 } };
}

/**
 * Bring a pre-v6 analysis (harmonic regions v5 + per-beat picks) to the v6
 * track without the audio: a provisional decode from the stored chroma, with
 * every chord the musician chose kept as a constraint. Re-analysing the audio
 * later replaces the provisional front end and keeps the constraints.
 * Mutates and returns `analysis`; analyses that already carry a track are untouched.
 */
export function migrateAnalysisToV6(analysis) {
  if (!analysis || analysis.harmony || !analysis.chordCandidates?.length || !(analysis.durationMs > 0)) return analysis;
  const constraints = legacyChoicesAsConstraints(analysis);
  const track = buildHarmonyTrack({
    frames: framesFromLegacyBeats(analysis), beatsSec: analysis.beats || [], bpm: analysis.bpm,
    rhythmConfidence: Number.isFinite(analysis.rhythmConfidence) ? analysis.rhythmConfidence : 0,
    durationMs: analysis.durationMs, constraints, source: { kind: 'mix' },
  });
  track.frontEnd = { ...track.frontEnd, kind: 'hpcp-migrated', provisional: true };
  analysis.harmony = track;
  analysis.harmonyMigration = { from: analysis.harmonicSegmentationVersion ?? null, at: new Date().toISOString(),
    provisional: true, keptChoices: constraints.length };
  return syncAnalysisViews(analysis);
}

/** True while the track still comes from a migrated (pre-v6) analysis. */
export const isProvisionalHarmony = (analysis) => Boolean(analysis?.harmony?.frontEnd?.provisional);
