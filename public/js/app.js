import { getAllSongs, saveSong, deleteSong, getAllSongsV2, deleteSongV2 } from './data/indexedDb.js';
import { validateSong, detectSongFormat } from './data/songValidator.js';
import { migrateLegacySong } from './data/legacyImporter.js';
import { importSongV2Document } from './data/importSongV2.js';
import { askCollision, promptBarsPerLine, showInfo } from './ui/importDialog.js';
import { openCalibrationEditor } from './ui/calibrationEditor.js';
import { enterStageMode, exitStageMode, adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, changeScale, toggleHarmony, toggleTab } from './stage/stageMode.js';

window.addEventListener('stageprompter:db', (e) => {
  alert(`Base de datos: ${e.detail.message}`);
});

console.log('🚀 app.js cargado');
window.stage = { adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, exitStageMode, changeScale, toggleHarmony, toggleTab };

let songs = [];
let songsV2 = [];
let currentEditSong = null;

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
  note.textContent = 'El modo escenario v2 todavía no está conectado en esta versión.';
  note.style.cssText = 'font-size:0.85em;color:#6b7280;';
  info.appendChild(note);
  div.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'song-actions';
  actions.appendChild(buildActionButton('🎚️ CALIBRAR', 'calibrate-v2', song.id, 'btn-stage'));
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
    } else if (action === 'stage') {
      const song = songs.find(s => s.id === id);
      if (song) {
        document.getElementById('app').style.display = 'none';
        document.getElementById('stage-container').style.display = 'block';
        enterStageMode(song, document.getElementById('stage-content'));
      }
    } else if (action === 'edit') {
      const song = songs.find(s => s.id === id);
      if (song) openEditor(song);
    }
  };
}

const modal = document.getElementById('editor-modal');
const closeBtn = document.querySelector('.modal-close');

document.getElementById('btn-new').addEventListener('click', () => {
  console.log('➕ Nueva canción');
  currentEditSong = {
    id: 'song-' + Date.now(),
    metadata: { title: 'Nueva Canción', artist: '', originalKey: 'C', bpm: 120, timeSignature: '4/4' },
    references: { youtube_studio: '', youtube_live: '', youtube_tutorial: '' },
    structure: [{ type: 'Verse', label: 'Verso 1', key: 'C', lines: [{ lyrics: 'Letra aquí', chords: [] }] }]
  };
  openEditor(currentEditSong);
});

closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
document.getElementById('btn-cancel-edit').addEventListener('click', () => { modal.style.display = 'none'; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

document.querySelectorAll('.editor-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

function openEditor(song) {
  console.log('️ Abriendo editor:', song.metadata.title);
  currentEditSong = JSON.parse(JSON.stringify(song));
  document.getElementById('editor-title').textContent = 'Editar: ' + song.metadata.title;
  document.getElementById('edit-title').value = currentEditSong.metadata.title || '';
  document.getElementById('edit-artist').value = currentEditSong.metadata.artist || '';
  document.getElementById('edit-key').value = currentEditSong.metadata.originalKey || 'C';
  document.getElementById('edit-bpm').value = currentEditSong.metadata.bpm || 120;
  document.getElementById('edit-youtube-studio').value = currentEditSong.references?.youtube_studio || '';
  document.getElementById('edit-youtube-live').value = currentEditSong.references?.youtube_live || '';
  renderSectionsEditor();
  modal.style.display = 'flex';
}

function renderSectionsEditor() {
  const container = document.getElementById('sections-editor');
  container.innerHTML = '';
  currentEditSong.structure.forEach((section, sIdx) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'editor-section';
    secDiv.innerHTML = `
      <div class="section-header-editor">
        <input type="text" class="form-input-sm" value="${section.label || section.type}" data-sidx="${sIdx}" data-field="label">
        <select class="form-input-sm" data-sidx="${sIdx}" data-field="key">
          ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k => `<option value="${k}" ${section.key === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
        <button class="btn-small btn-danger" data-remove-section="${sIdx}">🗑️</button>
      </div>`;
      
    section.lines.forEach((line, lIdx) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'editor-line';
      let chordsHtml = line.chords.map((ch, cIdx) => `
        <div class="chord-input-group">
          <input type="text" class="form-input-sm" value="${ch.chord}" data-sidx="${sIdx}" data-lidx="${lIdx}" data-cidx="${cIdx}" data-field="chord" placeholder="Acorde">
          <input type="number" class="form-input-sm" value="${ch.position}" data-sidx="${sIdx}" data-lidx="${lIdx}" data-cidx="${cIdx}" data-field="position" style="width:60px">
          <button class="btn-tiny" data-remove-chord="${sIdx},${lIdx},${cIdx}">×</button>
        </div>`).join('');
        
      lineDiv.innerHTML = `
        <input type="text" class="form-input" value="${line.lyrics}" data-sidx="${sIdx}" data-lidx="${lIdx}" data-field="lyrics" placeholder="Letra">
        <div class="chords-editor">
          ${chordsHtml}
          <button class="btn-tiny btn-add" data-add-chord="${sIdx},${lIdx}">+ Acorde</button>
        </div>`;
      secDiv.appendChild(lineDiv);
    });
    
    const addLineBtn = document.createElement('button');
    addLineBtn.className = 'btn-small';
    addLineBtn.textContent = '+ Línea';
    addLineBtn.dataset.addLine = sIdx;
    secDiv.appendChild(addLineBtn);
    container.appendChild(secDiv);
  });
  
  container.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('change', (e) => {
      const sIdx = parseInt(e.target.dataset.sidx);
      const field = e.target.dataset.field;
      if (field === 'label') currentEditSong.structure[sIdx].label = e.target.value;
      if (field === 'key') currentEditSong.structure[sIdx].key = e.target.value;
      const lIdx = e.target.dataset.lidx;
      if (lIdx !== undefined) {
        const l = parseInt(lIdx);
        if (field === 'lyrics') currentEditSong.structure[sIdx].lines[l].lyrics = e.target.value;
        const cIdx = e.target.dataset.cidx;
        if (cIdx !== undefined) {
          const c = parseInt(cIdx);
          if (field === 'chord') currentEditSong.structure[sIdx].lines[l].chords[c].chord = e.target.value;
          if (field === 'position') currentEditSong.structure[sIdx].lines[l].chords[c].position = parseInt(e.target.value) || 0;
        }
      }
    });
  });
  
  container.querySelectorAll('[data-remove-section]').forEach(btn => {
    btn.onclick = () => { currentEditSong.structure.splice(parseInt(btn.dataset.removeSection), 1); renderSectionsEditor(); };
  });
  container.querySelectorAll('[data-add-line]').forEach(btn => {
    btn.onclick = () => { currentEditSong.structure[parseInt(btn.dataset.addLine)].lines.push({ lyrics: '', chords: [] }); renderSectionsEditor(); };
  });
  container.querySelectorAll('[data-add-chord]').forEach(btn => {
    const [s, l] = btn.dataset.addChord.split(',').map(Number);
    btn.onclick = () => { currentEditSong.structure[s].lines[l].chords.push({ chord: '', position: 0 }); renderSectionsEditor(); };
  });
  container.querySelectorAll('[data-remove-chord]').forEach(btn => {
    const [s, l, c] = btn.dataset.removeChord.split(',').map(Number);
    btn.onclick = () => { currentEditSong.structure[s].lines[l].chords.splice(c, 1); renderSectionsEditor(); };
  });
}

document.getElementById('btn-add-section').addEventListener('click', () => {
  currentEditSong.structure.push({ type: 'Verse', label: 'Nueva Sección', key: currentEditSong.metadata.originalKey || 'C', lines: [{ lyrics: '', chords: [] }] });
  renderSectionsEditor();
});

document.getElementById('btn-save-song').addEventListener('click', async () => {
  currentEditSong.metadata.title = document.getElementById('edit-title').value || 'Sin título';
  currentEditSong.metadata.artist = document.getElementById('edit-artist').value;
  currentEditSong.metadata.originalKey = document.getElementById('edit-key').value;
  currentEditSong.metadata.bpm = parseInt(document.getElementById('edit-bpm').value) || 120;
  currentEditSong.references = {
    youtube_studio: document.getElementById('edit-youtube-studio').value,
    youtube_live: document.getElementById('edit-youtube-live').value,
    youtube_tutorial: ''
  };
  const validation = validateSong(currentEditSong);
  if (!validation.valid) { alert('Error:\n' + validation.errors.join('\n')); return; }
  await saveSong(currentEditSong);
  modal.style.display = 'none';
  loadLibrary();
  alert('Guardada correctamente');
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
    const bars = await promptBarsPerLine(raw?.metadata?.title || raw.id || 'canción legacy');
    if (bars !== null) {
      try {
        const { document: migrated, warnings } = migrateLegacySong(raw, { barsPerLine: bars });
        const result = await importSongV2Document(migrated, askCollision);
        if (result.status === 'invalid') {
          await showInfo('La migración no pasó su propia validación v2', formatErrorList(result.errors));
        } else if (result.status !== 'cancelled') {
          await showInfo('Migración a v2 completa', [`Estado: ${result.status}`, `ID: ${result.id}`, ...warnings.slice(0, 5)]);
          loadLibrary();
        }
      } catch (migrationErr) {
        await showInfo('No se pudo migrar', [migrationErr.message]);
      }
    }
  } else {
    alert('Formato no reconocido: no es un SongDocument v2 (schemaVersion:2) ni un documento legacy (structure[]).');
  }

  e.target.value = '';
});

loadLibrary();