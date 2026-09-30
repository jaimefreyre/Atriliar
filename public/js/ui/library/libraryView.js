import { getAllSongs, getAllSongsV2, getAllProjects, saveSong, deleteSong, deleteSongV2 } from '../../data/indexedDb.js';
import { deleteWorkspace, importProjectBackupData } from '../../data/projectRepo.js';
import { buildBackup, isBackupDocument } from '../../data/backup.js';
import { validateSong, detectSongFormat, validateSongV2 } from '../../data/songValidator.js';
import { importSongV2Document } from '../../data/importSongV2.js';
import { isLocallyReviewed } from '../../data/reviewState.js';
import { showAlert, showConfirm, showToast } from '../components/dialogs.js';
import { routeTo } from '../shell/router.js';

const e = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const formatBytes = (value) => value < 1024 ** 2 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`;

export function createLibraryView(host, { navigate } = {}) {
  let songs = []; let songsV1 = []; let projects = []; let activeFilter = 'all'; let query = '';
  host.className = 'sp-library-host';
  const intro = document.createElement('section'); intro.className = 'sp-library__intro';
  intro.append(e('p', 'LABORATORIO MUSICAL · ESPACIO LOCAL', 'sp-eyebrow'), e('h1', 'Escucha, analiza y construye tu música.'), e('p', 'Cada pieza mantiene su audio, mapa armónico, notas y versiones de estudio en un mismo proyecto.'), e('span', 'Los archivos y el análisis se guardan en este dispositivo.'));
  const actions = document.createElement('section'); actions.className = 'sp-library__actions';
  const newAudio = e('button', '＋ Nueva desde audio', 'sp-btn sp-btn--primary'); newAudio.type = 'button'; newAudio.addEventListener('click', () => navigate({ name: 'song', songId: 'new', mode: 'autopsia' }));
  const newSong = e('button', '＋ Canción sin audio', 'sp-btn'); newSong.type = 'button'; newSong.addEventListener('click', () => navigate({ name: 'song', songId: 'new', mode: 'cifrado' }));
  const importLabel = e('label', 'Importar JSON', 'sp-btn'); const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.className = 'sp-visually-hidden'; importInput.setAttribute('aria-label', 'Seleccionar respaldo JSON'); importLabel.append(importInput); importInput.addEventListener('change', async () => { const file = importInput.files?.[0]; if (file) await importFile(file); importInput.value = ''; });
  const exportButton = e('button', 'Descargar respaldo', 'sp-btn'); exportButton.type = 'button'; exportButton.addEventListener('click', exportBackup);
  actions.append(newAudio, newSong, importLabel, exportButton);
  const storage = document.createElement('section'); storage.className = 'sp-storage'; storage.setAttribute('aria-label', 'Almacenamiento local');
  const storageTitle = e('strong', 'Almacenamiento local'); const storageText = e('span', 'Consultando espacio…'); storage.append(storageTitle, storageText);
  const tools = document.createElement('section'); tools.className = 'sp-library__tools';
  const searchLabel = e('label', 'Buscar canciones o proyectos'); searchLabel.className = 'sp-visually-hidden';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Buscar canción o artista…'; search.autocomplete = 'off'; search.setAttribute('aria-label', 'Buscar canciones o proyectos'); search.addEventListener('input', () => { query = search.value.trim().toLocaleLowerCase(); renderLists(); });
  const filter = document.createElement('div'); filter.className = 'sp-library__filters'; filter.setAttribute('role', 'group'); filter.setAttribute('aria-label', 'Filtrar biblioteca');
  const filters = [['all', 'Todo'], ['review', 'Por revisar'], ['reviewed', 'Revisadas']];
  for (const [value, label] of filters) { const button = e('button', label, 'sp-btn sp-btn--sm'); button.type = 'button'; button.setAttribute('aria-pressed', String(value === activeFilter)); button.addEventListener('click', () => { activeFilter = value; for (const item of filter.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button)); renderLists(); }); filter.append(button); }
  tools.append(searchLabel, search, filter);
  const heading = e('h2', 'Tus piezas'); heading.className = 'sp-library__heading';
  const results = document.createElement('div'); results.className = 'sp-library__results'; results.setAttribute('aria-live', 'polite');
  const legacyDetails = document.createElement('details'); legacyDetails.className = 'sp-legacy-group';
  const legacySummary = e('summary', 'Documentos v1'); const legacyCount = e('span', '0'); legacyCount.className = 'sp-badge'; legacySummary.append(legacyCount);
  const legacyList = document.createElement('div'); legacyList.className = 'sp-library__results'; legacyDetails.append(legacySummary, legacyList);
  host.replaceChildren(intro, actions, storage, tools, heading, results, legacyDetails);

  async function refresh() {
    try { [songs, songsV1, projects] = await Promise.all([getAllSongsV2(), getAllSongs(), getAllProjects()]); }
    catch (error) { await showAlert('No se pudo leer la biblioteca', error.message || String(error)); songs = []; songsV1 = []; projects = []; }
    legacyCount.textContent = String(songsV1.length);
    legacyDetails.hidden = songsV1.length === 0;
    await updateStorage();
    renderLists();
  }

  async function updateStorage() {
    if (!navigator.storage?.estimate) { storageText.textContent = 'El navegador no informa una cuota de almacenamiento.'; return; }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    storageText.textContent = `${formatBytes(usage)} usados${quota ? ` de ${formatBytes(quota)}` : ''} · audio guardado localmente`;
    storage.setAttribute('aria-label', `Almacenamiento local: ${formatBytes(usage)} usados${quota ? ` de ${formatBytes(quota)}` : ''}`);
  }

  function cardFor(song, { legacy = false, project = null, reviewed = false } = {}) {
    const card = document.createElement('article'); card.className = 'sp-library-card';
    card.dataset.songId = song.id;
    const content = document.createElement('div'); content.className = 'sp-library-card__content';
    const title = e('h3', song.metadata?.title || project?.title || 'Pieza sin título');
    const subtitle = e('p', `${song.metadata?.artist || project?.artist || 'Artista sin indicar'} · ${song.metadata?.key || project?.bpm ? `${song.metadata?.key || 'Tonalidad pendiente'} · ${song.metadata?.bpm || project?.bpm || '—'} BPM` : 'Proyecto de audio'}`);
    const badges = document.createElement('div'); badges.className = 'sp-library-card__badges';
    const badge = (label, kind = '') => e('span', label, `sp-badge${kind ? ` sp-badge--${kind}` : ''}`);
    if (legacy) { badges.append(badge('V1', 'legacy'), badge('Pendiente de convertir')); }
    else {
      const analyzed = Boolean(project?.analysisRefs?.length);
      badges.append(badge(reviewed ? 'Revisada' : analyzed ? 'Análisis guardado' : song.timing?.status === 'estimated' ? 'Estimación' : 'Borrador', reviewed ? 'confirmed' : analyzed ? 'harmony' : 'estimated'));
      if (song.audio?.assetId || project?.audioAssetId) badges.append(badge('Audio local'));
      if (project) badges.append(badge('Proyecto vinculado'));
    }
    content.append(title, subtitle, badges); card.append(content);
    const buttons = document.createElement('div'); buttons.className = 'sp-library-card__actions';
    if (legacy) {
      const convert = e('button', 'Convertir a Cifrado', 'sp-btn sp-btn--sm sp-btn--primary'); convert.type = 'button'; convert.addEventListener('click', () => navigate({ name: 'song', songId: song.id, mode: 'cifrado', query: { v1: '1' } })); buttons.append(convert);
    } else {
      const open = e('button', project ? 'Abrir laboratorio' : 'Abrir canción', 'sp-btn sp-btn--sm sp-btn--primary'); open.type = 'button'; open.addEventListener('click', () => navigate({ name: 'song', songId: song.id, mode: 'autopsia' }));
      const atril = e('button', 'Atril', 'sp-btn sp-btn--sm'); atril.type = 'button'; atril.addEventListener('click', () => navigate({ name: 'song', songId: song.id, mode: 'atril' }));
      const remove = e('button', 'Eliminar', 'sp-btn sp-btn--sm sp-btn--danger'); remove.type = 'button'; remove.addEventListener('click', async () => { if (!await showConfirm('Eliminar pieza', `Se eliminará «${song.metadata?.title || 'esta pieza'}» de este dispositivo.`)) return; if (project) await deleteWorkspace(project.projectId); await deleteSongV2(song.id); showToast('Pieza eliminada.', { kind: 'success' }); await refresh(); });
      buttons.append(open, atril, remove);
    }
    card.append(buttons); return card;
  }

  async function renderLists() {
    results.replaceChildren();
    const projectBySong = new Map(projects.map((project) => [project.songId, project]));
    const statuses = await Promise.all(songs.map(async (song) => [song, await isLocallyReviewed(song).catch(() => false)]));
    const filtered = statuses.filter(([song, reviewed]) => {
      const project = projectBySong.get(song.id);
      const match = `${song.metadata?.title || ''} ${song.metadata?.artist || ''} ${project?.title || ''}`.toLocaleLowerCase().includes(query);
      return match && (activeFilter === 'all' || (activeFilter === 'reviewed' ? reviewed : !reviewed));
    });
    if (!filtered.length) results.append(e('p', query ? 'No hay coincidencias.' : 'Todavía no hay piezas. Crea un laboratorio desde audio para empezar.', 'sp-empty-state'));
    for (const [song, reviewed] of filtered) results.append(cardFor(song, { project: projectBySong.get(song.id), reviewed }));
    legacyList.replaceChildren();
    const v1Filtered = songsV1.filter((song) => `${song.metadata?.title || ''} ${song.metadata?.artist || ''}`.toLocaleLowerCase().includes(query));
    if (!v1Filtered.length && songsV1.length) legacyList.append(e('p', 'No hay coincidencias en los documentos v1.', 'sp-empty-state'));
    for (const song of v1Filtered) legacyList.append(cardFor(song, { legacy: true }));
    heading.textContent = query ? `Resultados · ${filtered.length}` : `Tus piezas · ${filtered.length}`;
  }

  async function importFile(file) {
    try {
      const raw = JSON.parse(await file.text());
      const collision = async (existing, incoming) => await showConfirm('Canción ya existente', `«${incoming.metadata?.title || incoming.id}» ya está en la biblioteca. ¿Quieres reemplazarla?`, 'Reemplazar') ? 'replace' : 'cancel';
      if (isBackupDocument(raw)) {
        let imported = 0; let skipped = 0; let invalid = 0; const songIdMap = new Map();
        for (const song of raw.songsV2) { const outcome = await importSongV2Document(song, collision); if (['created', 'replaced', 'duplicated'].includes(outcome.status)) { imported++; songIdMap.set(song.id, outcome.id); } else if (outcome.status === 'invalid') invalid++; else skipped++; }
        for (const source of raw.legacySongs) { const song = structuredClone(source); const checked = validateSong(song); if (!checked.valid) { invalid++; continue; } const old = songsV1.find((item) => item.id === song.id); if (old && !await showConfirm('Canción ya existente', `¿Reemplazar «${song.metadata?.title || song.id}»?`, 'Reemplazar')) { skipped++; continue; } await saveSong(song); imported++; }
        const related = await importProjectBackupData({ projects: raw.projects || [], analyses: raw.analyses || [], songIdMap });
        await showAlert('Respaldo importado', [`Canciones: ${imported}`, `Omitidas: ${skipped}`, `Inválidas: ${invalid}`, `Proyectos: ${related.importedProjects}`, `Análisis: ${related.importedAnalyses}`, 'El archivo de respaldo no contiene audio.']);
      } else {
        const format = detectSongFormat(raw);
        if (format === 'v2') {
          const outcome = await importSongV2Document(raw, collision);
          if (outcome.status === 'invalid') throw new Error(outcome.errors.map((item) => `${item.instancePath || '/'}: ${item.message}`).join('\n'));
          if (outcome.status !== 'cancelled') showToast('Canción importada.', { kind: 'success' });
        } else if (format === 'legacy') {
          const checked = validateSong(raw); if (!checked.valid) throw new Error(checked.errors.join('\n'));
          if (songsV1.some((item) => item.id === raw.id) && !await showConfirm('Canción ya existente', `¿Reemplazar «${raw.metadata?.title || raw.id}»?`, 'Reemplazar')) return;
          await saveSong(raw); showToast('Canción v1 importada. Puedes convertirla a Cifrado.', { kind: 'success' });
        } else if (validateSongV2(raw).valid) {
          const outcome = await importSongV2Document(raw, collision); if (outcome.status === 'invalid') throw new Error('El documento no pasó la validación.');
        } else throw new Error('El JSON no es una canción ni un respaldo StagePrompter reconocido.');
      }
      await refresh();
    } catch (error) { await showAlert('No se pudo importar el archivo', error.message || String(error)); }
  }

  async function exportBackup() {
    const backup = buildBackup({ legacySongs: await getAllSongs(), songsV2: await getAllSongsV2(), projects: await getAllProjects() });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `stageprompter-respaldo-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { refresh, host };
}
