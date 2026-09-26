import { getAllSongs, saveSong, deleteSong } from './data/indexedDb.js';
import { validateSong } from './data/songValidator.js';
import { enterStageMode, exitStageMode, adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, changeScale, toggleHarmony, toggleTab } from './stage/stageMode.js';

console.log('🚀 app.js cargado');
window.stage = { adjustTranspose, adjustFontSize, toggleAutoScroll, prevChord, nextChord, exitStageMode, changeScale, toggleHarmony, toggleTab };

let songs = [];
let currentEditSong = null;

async function loadLibrary() {
  console.log('📚 Cargando biblioteca...');
  try {
    songs = await getAllSongs();
    console.log(`✅ ${songs.length} canciones cargadas`);
  } catch (err) {
    console.error('❌ Error al cargar canciones:', err);
    songs = [];
  }
  
  const list = document.getElementById('song-list');
  if (!list) { console.error('❌ No existe #song-list'); return; }
  list.innerHTML = '';
  
  if (songs.length === 0) {
    list.innerHTML = '<p class="empty">No hay canciones. Importa un JSON o crea una nueva.</p>';
    return;
  }

  songs.forEach(song => {
    const div = document.createElement('div');
    div.className = 'song-item';
    let videoInfo = '';
    if (song.references) {
      const vc = [song.references.youtube_studio, song.references.youtube_live, song.references.youtube_tutorial].filter(v => v).length;
      if (vc > 0) videoInfo = `<span class="badge video-badge">📹 ${vc}</span>`;
    }
    div.innerHTML = `
      <div class="song-info">
        <strong>${song.metadata.title}</strong>
        <span>${song.metadata.artist || 'Desconocido'}</span>
        <span class="badge">${song.metadata.originalKey}</span>
        <span class="badge">${song.metadata.bpm} BPM</span>
        ${videoInfo}
      </div>
      <div class="song-actions">
        <button class="btn-sm" data-action="edit" data-id="${song.id}">✏️ EDITAR</button>
        <button class="btn-sm btn-stage" data-action="stage" data-id="${song.id}">▶ STAGE</button>
        <button class="btn-sm btn-danger" data-action="delete" data-id="${song.id}">🗑️</button>
      </div>`;
    list.appendChild(div);
  });

  list.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const song = songs.find(s => s.id === id);
    console.log(`🖱️ Click: ${action} en ${id}`);
    
    if (action === 'delete') {
      if (confirm('¿Eliminar esta canción?')) {
        await deleteSong(id);
        loadLibrary();
      }
    } else if (action === 'stage' && song) {
      document.getElementById('app').style.display = 'none';
      document.getElementById('stage-container').style.display = 'block';
      enterStageMode(song, document.getElementById('stage-content'));
    } else if (action === 'edit' && song) {
      openEditor(song);
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

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  console.log('📄 Archivo:', file.name);
  try {
    const song = JSON.parse(await file.text());
    const v = validateSong(song);
    if (!v.valid) { alert('Error:\n' + v.errors.join('\n')); return; }
    await saveSong(song);
    loadLibrary();
    alert('Importada correctamente');
  } catch (err) {
    alert('JSON inválido: ' + err.message);
  }
  e.target.value = '';
});

loadLibrary();