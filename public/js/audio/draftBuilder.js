import { createUnclassifiedSections, segmentChordSuggestions } from './segmentation.js';

/** Create an estimated, editable v2 draft; lyrics and song structure stay empty/unclassified. */
export function buildAudioDraft({ title, artist = '', durationMs, bpm, timeSignature = { numerator: 4, denominator: 4 },
  key = null, chordSuggestions = [], uncertainChordCount = 0, audioAssetId = null }) {
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('El borrador necesita un título.');
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('El BPM estimado debe ser positivo.');
  const chords = segmentChordSuggestions(chordSuggestions, durationMs).map((item, index) => ({
    id: `audio-chord-${String(index + 1).padStart(3, '0')}`,
    startMs: item.startMs, endMs: item.endMs, symbol: item.symbol, bassNote: null, anchor: null, scale: null,
  }));
  const warnings = [
    'Borrador generado automáticamente desde audio; verificar BPM y cambios de acorde escuchando la pista.',
    'La letra, la estructura formal y las anclas de acordes no se analizaron; completarlas en el editor.',
  ];
  if (chords.length === 0) warnings.push('No se obtuvo ningún acorde con suficiente claridad; no se inventaron acordes.');
  else if (chords.length < chordSuggestions.length) warnings.push('Se recortaron límites y se combinaron candidatos de acorde; revisar cada cambio en el editor.');
  if (uncertainChordCount > 0) warnings.push(`${uncertainChordCount} segmentos no superaron el umbral de claridad y quedaron sin acorde; revisar escuchando la pista.`);
  const doc = {
    schemaVersion: 2,
    id: `audio-draft-${Date.now()}`,
    metadata: { title: title.trim(), artist: artist.trim(), key, bpm: Math.round(bpm * 100) / 100, timeSignature },
    durationMs,
    timing: { status: 'estimated', method: 'auto-analyzed', notes: 'Estimación automática; no constituye alineación temporal revisada.' },
    audio: audioAssetId ? { assetId: audioAssetId, offsetMs: 0 } : null,
    sections: createUnclassifiedSections(durationMs), lines: [], chords, tabs: [], sources: [],
    reviewWarnings: warnings,
  };
  return doc;
}
