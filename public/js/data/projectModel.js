import { buildLabSong } from '../audio/labComposition.js';
import { syncAnalysisToSong } from './chartSync.js';

const SECTION_TYPES = new Set(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'instrumental', 'outro', 'other']);

function stableSlug(value) {
  const slug = String(value || 'lab').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'lab';
  if (slug.length <= 78) return slug;
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${slug.slice(0, 68)}-${(hash >>> 0).toString(16)}`;
}

function normalizedSections(lab, durationMs) {
  const source = Array.isArray(lab?.sections) ? lab.sections : [];
  if (!source.length) return [{ id: 'section-001', type: 'instrumental', label: 'Pieza completa', key: null, startMs: 0, endMs: durationMs }];
  return source.map((section, index) => ({
    id: /^section-[A-Za-z0-9._-]+$/.test(section.id || '') ? section.id : `section-${stableSlug(section.id || index + 1)}`,
    type: SECTION_TYPES.has(section.type) ? section.type : 'other',
    label: String(section.label || section.type || `Sección ${index + 1}`).trim().slice(0, 80) || `Sección ${index + 1}`,
    key: null,
    startMs: Math.round(section.startMs),
    endMs: Math.round(section.endMs),
  }));
}

function songFromLab(lab, songId) {
  const durationMs = Math.round(Number(lab?.analysis?.durationMs)
    || Math.max(0, ...(Array.isArray(lab?.sections) ? lab.sections.map((section) => Number(section.endMs) || 0) : [])));
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) return null;
  const bpm = Number.isFinite(lab?.bpm) && lab.bpm > 0 ? lab.bpm : Number(lab?.analysis?.bpm) || 120;
  const sections = normalizedSections(lab, durationMs);
  // Keep a malformed workspace partition from making an invalid SongDocument;
  // the raw section snapshot is still stored in the local project record.
  const validPartition = sections[0]?.startMs === 0
    && sections.at(-1)?.endMs === durationMs
    && sections.every((section, index) => Number.isSafeInteger(section.startMs) && Number.isSafeInteger(section.endMs)
      && section.startMs < section.endMs && (index === 0 || sections[index - 1].endMs === section.startMs));
  const safeSections = validPartition ? sections
    : [{ id: 'section-001', type: 'instrumental', label: 'Pieza completa', key: null, startMs: 0, endMs: durationMs }];
  const labSections = Array.isArray(lab?.sections) ? lab.sections : [];
  const sectionsWithText = safeSections.map((section, index) => ({ ...section,
    lyric: validPartition ? String(labSections[index]?.lyric || '') : '',
    tab: validPartition ? String(labSections[index]?.tab || '') : '',
  }));
  const song = buildLabSong({
    title: String(lab?.title || 'Pieza sin título').trim() || 'Pieza sin título',
    artist: String(lab?.artist || ''), durationMs, bpm,
    chordSuggestions: [], uncertainChordCount: 0,
    audioAssetId: lab?.audioAssetId || null, sections: sectionsWithText,
  });
  song.id = songId;
  if (!validPartition) song.reviewWarnings.push('La estructura del laboratorio no formaba una partición válida; se creó una sección de resguardo. El original sigue disponible en el laboratorio anterior.');
  const analysisTrack = lab?.analysis?.harmony;
  const projected = syncAnalysisToSong(song, lab?.analysis || {}, { previousGeneratedIds: [] });
  song.chords = projected.song.chords;
  song.reviewWarnings = Array.from(new Set([...song.reviewWarnings, ...projected.warnings]));
  if (analysisTrack?.regions?.some((region) => region.state === 'harmony')) {
    song.reviewWarnings = song.reviewWarnings.filter((warning) => !warning.startsWith('No se obtuvo ningún acorde'));
  }
  return { song, durationMs, sectionsWithText, generatedChordIds: projected.generatedChordIds,
    chartProvenance: projected.provenance };
}

export function stableSongIdForLab(lab) {
  return `audio-draft-${stableSlug(lab?.songId || lab?.id)}`.slice(0, 100);
}

/** Build one normalized project record for a portable SongDocument. */
export function projectFromSong(song, { now = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    projectId: `project-${song.id}`,
    songId: song.id,
    title: song.metadata.title,
    artist: song.metadata.artist || '',
    bpm: song.metadata.bpm,
    audioAssetId: song.audio?.assetId || null,
    sections: structuredClone(song.sections),
    sectionIdMap: Object.fromEntries(song.sections.map((section) => [section.id, section.id])),
    stems: [],
    loop: { bpm: song.metadata.bpm, loopStartMs: 0, loopEndMs: song.durationMs, loopEnabled: true, positionMs: 0, tracks: [] },
    selectedSectionId: null,
    analysisRefs: [],
    generatedChordIds: [],
    chartProvenance: [],
    // Existing chart entries become explicit constraints if analysis is added later.
    confirmedChords: song.chords.map((chord) => ({ startMs: chord.startMs, endMs: chord.endMs, symbol: chord.symbol })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Normalize a saved lab without copying its large analysis payload into `projects`. */
export function projectFromLab(lab, songId, { now = new Date().toISOString() } = {}) {
  const sections = Array.isArray(lab.sections) ? structuredClone(lab.sections) : [];
  const durationMs = Number(lab.analysis?.durationMs) || Math.max(0, ...sections.map((section) => Number(section.endMs) || 0));
  const sectionIdMap = Object.fromEntries(normalizedSections(lab, durationMs).map((section, index) => [sections[index]?.id || section.id, section.id]));
  return {
    schemaVersion: 1,
    projectId: lab.id || `project-${songId}`,
    songId,
    title: String(lab.title || 'Pieza sin título'),
    artist: String(lab.artist || ''),
    bpm: Number.isFinite(lab.bpm) && lab.bpm > 0 ? lab.bpm : Number(lab.analysis?.bpm) || 120,
    audioAssetId: lab.audioAssetId || null,
    fileName: String(lab.fileName || ''),
    sections,
    sectionIdMap,
    stems: Array.isArray(lab.stems) ? structuredClone(lab.stems) : [],
    loop: lab.loop ? structuredClone(lab.loop) : {},
    selectedSectionId: lab.selectedSectionId || null,
    analysisRefs: [],
    generatedChordIds: [],
    chartProvenance: [],
    confirmedChords: [],
    createdAt: lab.createdAt || now,
    updatedAt: lab.updatedAt || now,
  };
}

/** A v4 analysis key is unique per saved workspace/source. */
export function analysisFromLab(lab, songId, { now = new Date().toISOString() } = {}) {
  if (!lab?.analysis) return null;
  const track = lab.analysis.harmony;
  const engineVersion = `${track?.engine || 'analysis'}-v${track?.version ?? lab.analysis.version ?? 1}`;
  return {
    songId,
    source: `lab:${stableSlug(lab.id)}`,
    sourceKind: track?.source?.kind || 'mix',
    engineVersion,
    labProjectId: lab.id,
    durationMs: lab.analysis.durationMs || 0,
    bpm: lab.analysis.bpm || lab.bpm || null,
    analysis: structuredClone(lab.analysis),
    createdAt: lab.createdAt || now,
    updatedAt: lab.updatedAt || now,
  };
}

/** Convert a lab to a stable, editable SongDocument; no audio blobs are copied. */
export function songFromLabProject(lab, { songId = stableSongIdForLab(lab) } = {}) {
  return songFromLab(lab, songId)?.song || null;
}

/** Build the normalized records that a newly saved workspace owns. */
export function projectBundleFromLab(lab, { songId = stableSongIdForLab(lab), now = new Date().toISOString() } = {}) {
  const converted = songFromLab(lab, songId);
  if (!converted) return null;
  const project = projectFromLab(lab, songId, { now });
  project.generatedChordIds = converted.generatedChordIds;
  project.chartProvenance = converted.chartProvenance;
  const analysis = analysisFromLab(lab, songId, { now });
  project.analysisRefs = analysis ? [[songId, analysis.source, analysis.engineVersion]] : [];
  return { song: converted.song, project, analysis };
}

function labChartSignature(sections = []) {
  return JSON.stringify(sections.map(({ id, type, label, startMs, endMs, lyric, tab }) =>
    ({ id, type, label, startMs, endMs, lyric: String(lyric || ''), tab: String(tab || '') })));
}

export function hasLabChartChanged(currentSections, savedSections) {
  return labChartSignature(currentSections) !== labChartSignature(savedSections);
}

/** Keep user edits made in the laboratory and its linked SongDocument together. */
export function applyLabChartToSong(song, labSections) {
  const lab = { id: song.id, title: song.metadata.title, artist: song.metadata.artist, bpm: song.metadata.bpm,
    audioAssetId: song.audio?.assetId || null, sections: labSections, analysis: { durationMs: song.durationMs, bpm: song.metadata.bpm } };
  const converted = songFromLab(lab, song.id);
  if (!converted || converted.song.reviewWarnings.some((warning) => warning.includes('estructura del laboratorio no formaba'))) return null;
  const validLineIds = new Set(converted.song.lines.map((line) => line.id));
  const oldLines = new Map(song.lines.map((line) => [line.id, line]));
  const newLines = new Map(converted.song.lines.map((line) => [line.id, line]));
  const chords = song.chords.map((chord) => {
    if (!chord.anchor) return chord;
    const previousLine = oldLines.get(chord.anchor.lineId);
    const nextLine = newLines.get(chord.anchor.lineId);
    // A manual chord can keep its syllable anchor only while the source line
    // is unchanged. A deleted or edited lyric must not leave a stale offset.
    return validLineIds.has(chord.anchor.lineId) && previousLine?.text === nextLine?.text
      ? chord : { ...chord, anchor: null };
  });
  return { ...song, sections: converted.song.sections, lines: converted.song.lines, tabs: converted.song.tabs, chords };
}

/** Rehydrate the one-line-per-section laboratory editor from the canonical chart. */
export function labSectionsFromSong(song, sectionIdMap = {}) {
  if (!song?.sections) return [];
  const reverseMap = new Map(Object.entries(sectionIdMap).map(([sourceId, documentId]) => [documentId, sourceId]));
  return song.sections.map((section) => ({
    id: reverseMap.get(section.id) || section.id,
    type: section.type,
    label: section.label,
    startMs: section.startMs,
    endMs: section.endMs,
    lyric: song.lines.filter((line) => line.sectionId === section.id).map((line) => line.text).join('\n'),
    tab: song.tabs.filter((tab) => tab.sectionId === section.id).map((tab) => tab.ascii).join('\n'),
  }));
}
