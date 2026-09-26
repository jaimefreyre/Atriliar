import { getAllSongs, saveSong, deleteSong, getAllSongsV2, deleteSongV2, getSongV2 } from './data/indexedDb.js';
import { validateSong, detectSongFormat } from './data/songValidator.js';
import { migrateLegacySong } from './data/legacyImporter.js';
import { importSongV2Document } from './data/importSongV2.js';
import { askCollision, promptBarsPerLine, showInfo } from './ui/importDialog.js';
import { openCalibrationEditor } from './ui/calibrationEditor.js';
import { openPlayerView } from './ui/playerView.js';
import { exitStageMode, adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, changeScale, toggleHarmony, toggleTab } from './stage/stageMode.js';

window.addEventListener('stageprompter:db', (e) => {
  alert(`Base de datos: ${e.detail.message}`);
});

console.log('🚀 app.js cargado');
window.stage = { adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, exitStageMode, changeScale, toggleHarmony, toggleTab };

let songs = [];
let songsV2 = [];

function buildBadge(text, extraClass) {
  const span = document.createElement('span');
  span.className = extraClass ? `badge ${extraClass}` : 'badge';
  span.textContent = text;
  return span;
}

function buildActionButton(label, action, id, extraClass) {
  const btn = document.createElement('button');
  btn.className = extraClass ? `btn-sm ${extraClass}` : 'btn-sm';
  btn.textContent = label;
  btn.dataset.action = action;
  btn.dataset.id = id;
  return btn;
}

// Todo el marcado de la lista se arma con createElement/textContent, nunca
// innerHTML con datos de la canción: metadata.title/artist vienen de un
// JSON importado y no son de confianza.
function renderLegacySongItem(song) {
  const div = document.createElement('div');
  div.className = 'song-item';

  const info = document.createElement('div');
  info.className = 'song-info';
  const strong = document.createElement('strong');
  strong.textContent = song.metadata.title;
  info.appendChild(strong);
  const artistSpan = document.createElement('span');
  artistSpan.textContent = song.metadata.artist || 'Desconocido';
  info.appendChild(artistSpan);
  info.appendChild(buildBadge(song.metadata.originalKey));
  info.appendChild(buildBadge(`${song.metadata.bpm} BPM`));
  if (song.references) {
    const vc = [song.references.youtube_studio, song.references.youtube_live, song.references.youtube_tutorial].filter(v => v).length;
    if (vc > 0) info.appendChild(buildBadge(`📹 ${vc}`, 'video-badge'));
  }
  div.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'song-actions';
  actions.appendChild(buildActionButton('✏️ EDITAR', 'edit', song.id));
  actions.appendChild(buildActionButton('▶ STAGE', 'stage', song.id, 'btn-stage'));
  actions.appendChild(buildActionButton('🗑️', 'delete', song.id, 'btn-danger'));
  div.appendChild(actions);
  return div;
}

function renderV2SongItem(song) {
  const div = document.createElement('div');
  div.className = 'song-item';

  const info = document.createElement('div');
  info.className = 'song-info';
  const strong = document.createElement('strong');
  strong.textContent = song.metadata.title;
  info.appendChild(strong);
  const artistSpan = document.createElement('span');
  artistSpan.textContent = song.metadata.artist || 'Desconocido';
  info.appendChild(artistSpan);
  info.appendChild(buildBadge('v2', 'video-badge'));
  info.appendChild(buildBadge(song.metadata.key || '—'));
  info.appendChild(buildBadge(`${song.metadata.bpm} BPM`));
  info.appendChild(buildBadge(song.timing.status === 'reviewed' ? 'Revisada' : 'Estimada'));
  const note = document.createElement('span');
  note.textContent = 'Prompter v2 con audio, base o avance manual; setlist multi-canción pendiente.';
  note.style.cssText = 'font-size:0.85em;color:#6b7280;';
  info.appendChild(note);
  div.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'song-actions';
  actions.appendChild(buildActionButton('▶ REPRODUCIR', 'play-v2', song.id, 'btn-stage'));
  actions.appendChild(buildActionButton('🎚️ CALIBRAR', 'calibrate-v2', song.id));
  actions.appendChild(buildActionButton('🗑️', 'delete-v2', song.id, 'btn-danger'));
  div.appendChild(actions);
  return div;
}

async function loadLibrary() {
  try { songs = await getAllSongs(); } catch (err) { console.error('❌ Error al cargar canciones v1:', err); songs = []; }
  try { songsV2 = await getAllSongsV2(); } catch (err) { console.error('❌ Error al cargar canciones v2:', err); songsV2 = []; }

  const list = document.getElementById('song-list');
  if (!list) { console.error('❌ No existe #song-list'); return; }
  list.innerHTML = '';

  if (songs.length === 0 && songsV2.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No hay canciones. Importa un JSON o crea una nueva.';
    list.appendChild(p);
    return;
  }

  songsV2.forEach(song => list.appendChild(renderV2SongItem(song)));
  songs.forEach(song => list.appendChild(renderLegacySongItem(song)));

  list.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    console.log(`🖱️ Click: ${action} en ${id}`);

    if (action === 'delete') {
      if (confirm('¿Eliminar esta canción?')) { await deleteSong(id); loadLibrary(); }
    } else if (action === 'delete-v2') {
      if (confirm('¿Eliminar esta canción v2?')) { await deleteSongV2(id); loadLibrary(); }
    } else if (action === 'calibrate-v2') {
      const song = songsV2.find(s => s.id === id);
      if (song) await openCalibrationEditor(song, loadLibrary);
    } else if (action === 'play-v2') {
      const song = songsV2.find(s => s.id === id);
      if (song) await openPlayerView(song, loadLibrary);
    } else if (action === 'stage') {
      const song = songs.find(s => s.id === id);
      if (song) await openLegacyThroughV2(song, openPlayerView);
    } else if (action === 'edit') {
      const song = songs.find(s => s.id === id);
      if (song) await openLegacyThroughV2(song, openCalibrationEditor);
    }
  };
}

document.getElementById('btn-new').addEventListener('click', async () => {
  console.log('➕ Nueva canción');
  // Un solo editor: una canción nueva ya nace v2 (con estructura editable
  // desde la pestaña Estructura), no en el formato legacy sin tiempos.
  const blank = {
    schemaVersion: 2,
    id: `song-${Date.now()}`,
    metadata: { title: 'Nueva canción', artist: '', key: null, bpm: 120, timeSignature: { numerator: 4, denominator: 4 } },
    durationMs: 16000,
    timing: { status: 'estimated', method: 'manual', notes: 'Canción nueva creada desde cero; falta estructura y tiempos reales.' },
    audio: null,
    sections: [{ id: 'section-1', type: 'verse', label: 'VERSO 1', key: null, startMs: 0, endMs: 16000 }],
    lines: [],
    chords: [],
    tabs: [],
    sources: [],
    reviewWarnings: [],
  };
  await openCalibrationEditor(blank, loadLibrary);
});

const btnImport = document.getElementById('btn-import');
const fileInput = document.getElementById('file-input');

console.log(' btn-import:', btnImport);
console.log(' file-input:', fileInput);

btnImport.addEventListener('click', () => {
  console.log(' Click en importar');
  fileInput.click();
});

function formatErrorList(errors) {
  return errors.slice(0, 10).map(er => `${er.instancePath || '/'}: ${er.message}`);
}

/**
 * Compases por línea -> migrar -> importar con el mismo flujo de colisión
 * que IMPORTAR. Compartido entre "abrir una canción v1 en la vista v2" y el
 * botón de importar un archivo legacy, para no repetir el mismo flujo dos
 * veces. Devuelve null si el usuario canceló o la migración/validación
 * falló (ya mostró el diálogo correspondiente); nunca toca el v1 original.
 */
async function migrateAndImportLegacy(legacySong) {
  const bars = await promptBarsPerLine(legacySong?.metadata?.title || legacySong.id);
  if (bars === null) return null;
  let migrated, warnings;
  try {
    ({ document: migrated, warnings } = migrateLegacySong(legacySong, { barsPerLine: bars }));
  } catch (migrationErr) {
    await showInfo('No se pudo migrar', [migrationErr.message]);
    return null;
  }
  const result = await importSongV2Document(migrated, askCollision);
  if (result.status === 'invalid') {
    await showInfo('La migración no pasó su propia validación v2', formatErrorList(result.errors));
    return null;
  }
  if (result.status === 'cancelled') return null;
  return { result, warnings };
}

/**
 * Un solo lector/editor para toda la biblioteca: en vez de mantener el
 * escenario/editor legacy como una segunda experiencia paralela, "STAGE" y
 * "EDITAR" sobre una canción v1 la migran y abren la vista v2
 * correspondiente. El documento v1 original nunca se toca.
 */
async function openLegacyThroughV2(legacySong, openView) {
  const outcome = await migrateAndImportLegacy(legacySong);
  if (!outcome) return;
  const v2Song = await getSongV2(outcome.result.id);
  loadLibrary();
  await openView(v2Song, loadLibrary);
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  console.log('📄 Archivo:', file.name);

  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch (err) {
    alert('JSON inválido: ' + err.message);
    e.target.value = '';
    return;
  }

  const format = detectSongFormat(raw);

  if (format === 'v2') {
    const result = await importSongV2Document(raw, askCollision);
    if (result.status === 'invalid') {
      await showInfo('No se pudo importar (v2 inválido)', formatErrorList(result.errors));
    } else if (result.status !== 'cancelled') {
      await showInfo('Importación v2 completa', [`Estado: ${result.status}`, `ID: ${result.id}`]);
      loadLibrary();
    }
  } else if (format === 'legacy') {
    // Comportamiento existente sin cambios: se guarda tal cual en el store v1.
    const v = validateSong(raw);
    if (!v.valid) {
      alert('Error:\n' + v.errors.join('\n'));
    } else {
      await saveSong(raw);
      loadLibrary();
    }
    // Oferta explícita y opcional de migración a v2 (no reemplaza lo anterior).
    const outcome = await migrateAndImportLegacy(raw);
    if (outcome) {
      await showInfo('Migración a v2 completa', [`Estado: ${outcome.result.status}`, `ID: ${outcome.result.id}`, ...outcome.warnings.slice(0, 5)]);
      loadLibrary();
    }
  } else {
    alert('Formato no reconocido: no es un SongDocument v2 (schemaVersion:2) ni un documento legacy (structure[]).');
  }

  e.target.value = '';
});

loadLibrary();
