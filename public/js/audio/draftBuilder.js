import { createUnclassifiedSections, segmentChordSuggestions } from './segmentation.js';

// The contract requires bassNote to match the bass of a slash symbol (C/E → E).
const slashBassOf = (symbol) => /\/([A-G](?:#|b)?)$/.exec(symbol)?.[1] ?? null;

/**
 * Create an estimated, editable v2 draft; lyrics and song structure stay empty/unclassified.
 * chordSuggestions carry `confirmed`: automatic chords enter the chart too and
 * are reported as estimated until the musician confirms them.
 */
export function buildAudioDraft({ title, artist = '', durationMs, bpm, timeSignature = { numerator: 4, denominator: 4 },
  key = null, chordSuggestions = [], uncertainChordCount = 0, audioAssetId = null }) {
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('El borrador necesita un título.');
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('El BPM estimado debe ser positivo.');
  const resolved = segmentChordSuggestions(chordSuggestions, durationMs);
  const chords = resolved.map((item, index) => ({
    id: `audio-chord-${String(index + 1).padStart(3, '0')}`,
    startMs: item.startMs, endMs: item.endMs, symbol: item.symbol, bassNote: slashBassOf(item.symbol), anchor: null, scale: null,
  }));
  const warnings = [
    'Borrador generado automáticamente desde audio; verificar BPM y cambios de acorde escuchando la pista.',
    'La letra, la estructura formal y las anclas de acordes no se analizaron; completarlas en el editor.',
  ];
  const estimated = resolved.filter((item) => !item.confirmed).length;
  if (chords.length === 0) warnings.push('No se obtuvo ningún acorde con suficiente claridad; no se inventaron acordes.');
  else if (chords.length < chordSuggestions.length) warnings.push('Se recortaron límites y se combinaron candidatos de acorde; revisar cada cambio en el editor.');
  if (estimated > 0) warnings.push(`${estimated} de ${chords.length} acordes son estimados automáticamente y no están confirmados; revisarlos escuchando la pista.`);
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
