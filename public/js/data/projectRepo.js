import {
  deleteAnalysis, deleteProject, getAllProjects, getAnalysesForSong,
  getAnalysis, getAsset, getProject, getProjectById, getSongV2, saveAnalysis,
  saveProject, saveProjectBundle, saveSongProjectAnalysis,
} from './indexedDb.js';
import { validateSongV2 } from './songValidator.js';
import { analysisFromLab, applyLabChartToSong, hasLabChartChanged, projectFromLab, projectFromSong,
  projectBundleFromLab, stableSongIdForLab } from './projectModel.js';
import { syncAnalysisToSong } from './chartSync.js';

const stamp = () => new Date().toISOString();
const db = { deleteAnalysis, deleteProject, getAllProjects, getAnalysesForSong,
  getAnalysis, getAsset, getProject, getProjectById, getSongV2, saveAnalysis,
  saveProject, saveProjectBundle, saveSongProjectAnalysis };

export async function listProjects(store = db) {
  return (await store.getAllProjects()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function getWorkspace(projectId, store = db) {
  const project = await store.getProjectById(projectId);
  if (!project) return null;
  const song = await store.getSongV2(project.songId);
  const ref = project.analysisRefs?.at(-1);
  const analysisRecord = ref ? await store.getAnalysis(...ref) : (await store.getAnalysesForSong(project.songId)).at(-1);
  return { project, song, analysisRecord };
}

/** Create the local 1:1 companion when a portable v2 song is first opened. */
export async function ensureProjectForSong(song, { now = stamp(), store = db } = {}) {
  const existing = await store.getProject(song.id);
  if (existing) return existing;
  const project = projectFromSong(song, { now });
  await store.saveProject(project);
  return project;
}

/**
 * Save a newly analyzed workspace. The portable chart remains a SongDocument;
 * large analysis frames live in `analyses`, never in the project record.
 */
export async function saveWorkspaceFromLab(lab, { asset = null, now = stamp(), store = db } = {}) {
  const songId = lab?.songId || stableSongIdForLab(lab);
  const generated = projectBundleFromLab(lab, { songId, now });
  if (!generated) return { status: 'incomplete', message: 'Se necesita una duración válida para crear el proyecto.' };

  const existingSong = await store.getSongV2(songId);
  const existingProject = await store.getProject(songId);
  let song = generated.song;
  let project = generated.project;
  const analysis = analysisFromLab(lab, songId, { now });

  if (existingSong) {
    const chartChanged = hasLabChartChanged(lab.sections, existingProject?.sections || []);
    const chartSong = chartChanged ? applyLabChartToSong(existingSong, lab.sections) : existingSong;
    if (!chartSong) return { status: 'invalid', errors: [{ instancePath: '/sections', message: 'La estructura del laboratorio no forma una línea de tiempo válida.' }] };
    const synced = syncAnalysisToSong(chartSong, lab.analysis || {}, {
      previousGeneratedIds: existingProject?.generatedChordIds || [],
    });
    song = synced.song;
    project = {
      ...project,
      ...existingProject,
      projectId: lab.id || existingProject?.projectId || `project-${songId}`,
      songId,
      title: lab.title || existingSong.metadata.title,
      artist: lab.artist || existingSong.metadata.artist || '',
      bpm: Number(lab.bpm) || existingSong.metadata.bpm,
      audioAssetId: existingSong.audio?.assetId || lab.audioAssetId || null,
      sections: structuredClone(lab.sections || existingProject?.sections || []),
      sectionIdMap: generated.project.sectionIdMap,
      stems: structuredClone(lab.stems || existingProject?.stems || []),
      loop: structuredClone(lab.loop || existingProject?.loop || {}),
      generatedChordIds: synced.generatedChordIds,
      chartProvenance: synced.provenance,
      confirmedChords: existingProject?.confirmedChords || existingSong.chords
        .filter((chord) => !existingProject?.generatedChordIds?.includes(chord.id))
        .map(({ startMs, endMs, symbol }) => ({ startMs, endMs, symbol })),
      analysisRefs: existingProject?.analysisRefs || [],
      createdAt: existingProject?.createdAt || now,
      updatedAt: now,
    };
  }

  const validation = validateSongV2(song);
  if (!validation.valid) return { status: 'invalid', errors: validation.errors };
  if (asset && song.audio?.assetId !== asset.id) {
    return { status: 'invalid', errors: [{ instancePath: '/audio/assetId', message: 'El asset local debe coincidir con el audio del proyecto.' }] };
  }
  if (analysis) {
    const ref = [songId, analysis.source, analysis.engineVersion];
    project.analysisRefs = [...(project.analysisRefs || []).filter((item) => item[1] !== analysis.source), ref];
  }
  project.projectId ||= lab.id || `project-${songId}`;
  project.songId = songId;
  project.updatedAt = now;
  await store.saveProjectBundle({ song, project, analysis, asset });
  return { status: existingSong ? 'updated' : 'created', songId, song, project, analysis };
}

/**
 * Refresh only analyzer-generated chords; preserve hand-authored events and
 * clip suggestions around them so SongDocument's non-overlap rule holds.
 */
export async function updateCipher(songId, analysis, { now = stamp(), store = db } = {}) {
  const song = await store.getSongV2(songId);
  if (!song) return { status: 'missing-song' };
  const project = await store.getProject(songId) || projectFromSong(song, { now });
  const synced = syncAnalysisToSong(song, analysis, { previousGeneratedIds: project.generatedChordIds || [] });
  const validation = validateSongV2(synced.song);
  if (!validation.valid) return { status: 'invalid', errors: validation.errors };
  const updated = { ...project, generatedChordIds: synced.generatedChordIds, chartProvenance: synced.provenance,
    updatedAt: now };
  await store.saveSongProjectAnalysis({ song: synced.song, project: updated, analysis: null });
  return { status: 'updated', song: synced.song, project: updated, warnings: synced.warnings };
}

export async function deleteWorkspace(projectId, store = db) {
  const workspace = await getWorkspace(projectId, store);
  if (!workspace) return false;
  const records = await store.getAnalysesForSong(workspace.project.songId);
  for (const record of records) await store.deleteAnalysis(record.songId, record.source, record.engineVersion);
  await store.deleteProject(workspace.project.songId);
  return true;
}

/** Import v2 backup records only when their owning SongDocument was imported. */
export async function importProjectBackupData({ projects = [], analyses = [], songIdMap = new Map(), store = db } = {}) {
  if (!Array.isArray(projects) || !Array.isArray(analyses)) throw new TypeError('Los proyectos y análisis del respaldo deben ser arrays.');
  let importedProjects = 0;
  let importedAnalyses = 0;
  for (const raw of projects) {
    if (!songIdMap.has(raw.songId)) continue;
    const songId = songIdMap.get(raw.songId);
    if (!await store.getSongV2(songId)) continue;
    await store.saveProject({ ...raw, songId });
    importedProjects++;
  }
  for (const raw of analyses) {
    if (!songIdMap.has(raw.songId)) continue;
    const songId = songIdMap.get(raw.songId);
    if (!await store.getSongV2(songId)) continue;
    await store.saveAnalysis({ ...raw, songId });
    importedAnalyses++;
  }
  return { importedProjects, importedAnalyses };
}

export async function getProjectAudio(project, store = db) {
  return project?.audioAssetId ? store.getAsset(project.audioAssetId) : null;
}
