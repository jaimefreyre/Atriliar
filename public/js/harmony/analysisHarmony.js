import { redecodeHarmony, applyUserEdit, regionsForSong, HARMONY_VERSION } from './harmonyTrack.js';

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
