/**
 * The one editor for v2 songs (REQ-01/REQ-02/REQ-04, S1+S4): metadata,
 * structure (sections/lines/chords, including adding and removing them —
 * not just nudging marks on events that already exist) and audio linking,
 * organized as tabs (reusing the .editor-tabs/.editor-tab pattern the
 * legacy v1 editor already established) instead of one long page. Per
 * direction, this absorbs the v1 editor's structural-editing capability
 * (add/remove sections, lines, chords, edit metadata) so there is one
 * editor, not two that each do half the job.
 *
 * Playback stays live across every tab (the transport bar is outside the
 * tab content) since the whole point of marking a section/line/chord is
 * to correct it by listening, not by guessing numbers.
 *
 * Saving always re-validates the whole document (validateSongV2) before it
 * can reach IndexedDB; "declarar revisado" is the only thing that ever
 * grants local trust (reviewState.js), and it always re-hashes the exact
 * persisted document, never the claim a JSON import carried in.
 */

import { getAsset, saveSongV2, saveSongV2WithAsset } from '../data/indexedDb.js';
import { validateSongV2 } from '../data/songValidator.js';
import { markReviewed, isLocallyReviewed } from '../data/reviewState.js';
import { createTransport } from '../transport/transport.js';
import { createAudioTrackAdapter, checkAudioCoversRange } from '../transport/audioTrack.js';
import { createManualAdapter } from '../transport/manual.js';
import { el } from './dom.js';
import { showAlert, showToast } from './components/dialogs.js';

const SECTION_TYPES = ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'instrumental', 'outro', 'other'];
const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32];

/** @type {{song: object, transport: object, activeTab: string, pendingBlob: Blob|null, pendingAssetMeta: object|null, loopA: number|null, loopB: number|null, loopEnabled: boolean, onClose: Function|null}|null} */
let state = null;
// El adapter no forma parte del contrato del transporte; se guarda la
// referencia acá para poder llamar setVolume/setMuted directo sobre él.
let currentAdapterRef = null;

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toString().padStart(2, '0');
  const centi = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
  return `${m}:${rem}.${centi}`;
}

function newId(prefix) {
  const existing = new Set([
    ...state.song.sections.map((s) => s.id),
    ...state.song.lines.map((l) => l.id),
    ...state.song.chords.map((c) => c.id),
    ...state.song.tabs.map((t) => t.id),
  ]);
  let n = 1;
  let id;
  do { id = `${prefix}-new-${n++}`; } while (existing.has(id));
  return id;
}

// --- Mutaciones estructurales: cada inserción desplaza lo que viene
// después para nunca dejar un hueco/solape inválido; cada borrado
// desancla (nunca deja referencias huérfanas) en vez de arrastrar el borrado. ---

function shiftFrom(song, thresholdMs, deltaMs) {
  const bump = (ev) => { if (ev.startMs >= thresholdMs) { ev.startMs += deltaMs; ev.endMs += deltaMs; } };
  song.sections.forEach(bump);
  song.lines.forEach(bump);
  song.chords.forEach(bump);
  song.tabs.forEach(bump);
  song.durationMs += deltaMs;
}

function addSectionAtEnd(type, label, durationMs) {
  if (!label || !label.trim()) { showAlert('Dato requerido', 'Escribí una etiqueta para la sección.'); return; }
  if (!(durationMs > 0)) { showAlert('Duración inválida', 'La duración debe ser mayor que 0.'); return; }
  const startMs = state.song.durationMs;
  state.song.sections.push({ id: newId('section'), type, label: label.trim(), key: null, startMs, endMs: startMs + durationMs });
  state.song.durationMs += durationMs;
  state.dirty = true;
  render();
}

function removeSection(section) {
  const durationMs = section.endMs - section.startMs;
  const lineIds = new Set(state.song.lines.filter((l) => l.sectionId === section.id).map((l) => l.id));
  state.song.lines = state.song.lines.filter((l) => l.sectionId !== section.id);
  state.song.chords.forEach((c) => { if (c.anchor && lineIds.has(c.anchor.lineId)) c.anchor = null; });
  state.song.chords = state.song.chords.filter((c) => !(c.startMs >= section.startMs && c.startMs < section.endMs));
  state.song.tabs = state.song.tabs.filter((t) => t.sectionId !== section.id);
  state.song.sections = state.song.sections.filter((s) => s.id !== section.id);
  shiftFrom(state.song, section.endMs, -durationMs);
  state.dirty = true;
  render();
}

function addLineToSection(section, text, durationMs) {
  if (!text || !text.trim()) { showAlert('Dato requerido', 'Escribí el texto de la nueva línea.'); return; }
  if (!(durationMs > 0)) { showAlert('Duración inválida', 'La duración debe ser mayor que 0.'); return; }
  const insertAt = section.endMs;
  shiftFrom(state.song, insertAt, durationMs);
  section.endMs += durationMs;
  state.song.lines.push({ id: newId('line'), sectionId: section.id, startMs: insertAt, endMs: insertAt + durationMs, text: text.trim(), tokens: [] });
  state.song.lines.sort((a, b) => a.startMs - b.startMs);
  state.dirty = true;
  render();
}

function removeLine(line) {
  state.song.chords.forEach((c) => { if (c.anchor && c.anchor.lineId === line.id) c.anchor = null; });
  state.song.lines = state.song.lines.filter((l) => l.id !== line.id);
  state.dirty = true;
  render();
}

/** Ocupa el hueco más grande disponible dentro del rango de la línea; no desplaza el resto de la canción. */
function addChordToLine(line, symbol, durationMs) {
  if (!symbol || !symbol.trim()) { showAlert('Dato requerido', 'Escribí el símbolo del acorde.'); return; }
  const chordsInRange = state.song.chords
    .filter((c) => c.startMs < line.endMs && c.endMs > line.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const gaps = [];
  let cursor = line.startMs;
  chordsInRange.forEach((c) => {
    if (c.startMs > cursor) gaps.push([cursor, c.startMs]);
    cursor = Math.max(cursor, c.endMs);
  });
  if (cursor < line.endMs) gaps.push([cursor, line.endMs]);
  if (gaps.length === 0) { showAlert('No hay espacio disponible', 'Ajustá o quitá un acorde existente primero.'); return; }
  gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const [gapStart, gapEndFull] = gaps[0];
  const gapEnd = Math.min(gapEndFull, gapStart + Math.max(1, durationMs));
  state.song.chords.push({ id: newId('chord'), startMs: gapStart, endMs: gapEnd, symbol: symbol.trim(), bassNote: null, anchor: { lineId: line.id, charOffset: 0 }, scale: null });
  state.song.chords.sort((a, b) => a.startMs - b.startMs);
  state.dirty = true;
  render();
}

function removeChord(chord) {
  state.song.chords = state.song.chords.filter((c) => c.id !== chord.id);
  state.dirty = true;
  render();
}

function findEventById(id) {
  return state.song.sections.find((s) => s.id === id)
    || state.song.lines.find((l) => l.id === id)
    || state.song.chords.find((c) => c.id === id)
    || null;
}

function shiftSelected(deltaMs) {
  const checked = Array.from(document.querySelectorAll('#calibration-view input[type=checkbox][data-row-id]:checked')).map((c) => c.dataset.rowId);
  if (checked.length === 0) return;
  checked.forEach((id) => {
    const ref = findEventById(id);
    if (!ref) return;
    ref.startMs = Math.max(0, ref.startMs + deltaMs);
    ref.endMs = Math.max(ref.startMs + 1, ref.endMs + deltaMs);
  });
  state.dirty = true;
  render();
}

// --- Audio / transporte (sin cambios de fondo respecto de C3) ---

async function loadCurrentAudioSource() {
  if (state.pendingBlob) return { blob: state.pendingBlob, offsetMs: state.song.audio?.offsetMs ?? 0 };
  if (!state.song.audio) return null;
  const asset = await getAsset(state.song.audio.assetId);
  if (!asset) return null;
  return { blob: asset.blob, offsetMs: state.song.audio.offsetMs };
}

async function mountTransport() {
  state.transport?.dispose();
  const source = await loadCurrentAudioSource();
  if (source) {
    const adapter = createAudioTrackAdapter({ blob: source.blob, offsetMs: source.offsetMs, volume: state.volume ?? 1 });
    adapter.setMuted(state.muted ?? false);
    currentAdapterRef = adapter;
    state.transport = createTransport({ mode: 'audio', durationMs: state.song.durationMs, adapter });
    state.mediaMissing = false;
  } else {
    currentAdapterRef = null;
    state.transport = createTransport({ mode: 'manual', durationMs: state.song.durationMs, adapter: createManualAdapter() });
    state.mediaMissing = !!state.song.audio;
  }
  state.transport.subscribe((snap) => {
    if (state.loopEnabled && state.loopB !== null && snap.positionMs >= state.loopB) {
      state.transport.seek(state.loopA ?? 0);
    }
    renderTransportBar();
  });
}

function renderTransportBar() {
  const bar = document.getElementById('calib-transport-bar');
  if (!bar) return;
  bar.innerHTML = '';
  const snap = state.transport.getSnapshot();

  const playBtn = el('button', { className: 'btn-sm', onclick: () => (snap.state === 'playing' ? state.transport.pause() : state.transport.play()) }, [snap.state === 'playing' ? '⏸ Pausa' : '▶ Play']);
  const stopBtn = el('button', { className: 'btn-sm', onclick: () => state.transport.stop() }, ['■ Stop']);
  const slider = el('input', {
    type: 'range', min: '0', max: String(state.song.durationMs), value: String(Math.round(snap.positionMs)),
    style: 'width:260px;vertical-align:middle',
    oninput: (e) => state.transport.seek(Number(e.target.value)),
  });
  const timeLabel = el('span', {}, [`${fmtMs(snap.positionMs)} / ${fmtMs(state.song.durationMs)}  [${snap.state}${state.mediaMissing ? ' · audio no disponible' : ''}]`]);
  bar.appendChild(playBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(slider);
  bar.appendChild(timeLabel);
}

function adapterCall(method, arg) {
  currentAdapterRef?.[method]?.(arg);
}

async function handlePickFile(file) {
  const tempAudio = new Audio();
  const objectUrl = URL.createObjectURL(file);
  tempAudio.src = objectUrl;
  try {
    await new Promise((resolve, reject) => {
      tempAudio.addEventListener('loadedmetadata', resolve, { once: true });
      tempAudio.addEventListener('error', () => reject(new Error('No se pudo leer el archivo de audio')), { once: true });
    });
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    await showAlert('No se pudo vincular el audio', err.message);
    return;
  }
  const offsetMs = state.song.audio?.offsetMs ?? 0;
  const check = checkAudioCoversRange(tempAudio, offsetMs, state.song.durationMs);
  URL.revokeObjectURL(objectUrl);
  if (!check.ok) {
    await showAlert('El audio no cubre la canción', `El archivo dura ${Math.round(check.fileDurationMs)} ms y hacen falta ${check.requiredMs} ms (offset + duración). Elegí otro archivo o ajustá el offset.`);
    return;
  }
  state.pendingBlob = file;
  state.pendingAssetMeta = { name: file.name, mime: file.type || 'application/octet-stream', bytes: file.size, duration: check.fileDurationMs };
  // Always a fresh asset id: the previous asset may be shared with a lab
  // project, and saving under its id would silently swap that project's audio.
  state.song.audio = {
    assetId: `asset-${state.song.id}-${Date.now().toString(36)}`,
    offsetMs: state.song.audio?.offsetMs ?? 0,
  };
  state.dirty = true;
  await mountTransport();
  render();
}

/** @returns {Promise<boolean>} false si la validación rechazó el guardado (nada se persistió) */
async function handleSave() {
  const { valid, errors } = validateSongV2(state.song);
  if (!valid) {
    await showAlert('No se puede guardar', errors.slice(0, 10).map((e) => `${e.instancePath || '/'}: ${e.message}`).join('\n'));
    return false;
  }
  if (state.pendingBlob) {
    const asset = {
      id: state.song.audio.assetId,
      blob: state.pendingBlob,
      name: state.pendingAssetMeta.name,
      mime: state.pendingAssetMeta.mime,
      bytes: state.pendingAssetMeta.bytes,
      duration: state.pendingAssetMeta.duration,
    };
    await saveSongV2WithAsset(state.song, asset);
    state.pendingBlob = null;
    state.pendingAssetMeta = null;
  } else {
    await saveSongV2(state.song);
  }
  state.dirty = false;
  showToast('Canción guardada.', { kind: 'success' });
  render();
  return true;
}

async function handleDeclareReviewed() {
  if (state.dirty) {
    const saved = await handleSave();
    if (!saved) return;
  }
  state.song.timing = { ...state.song.timing, status: 'reviewed' };
  await saveSongV2(state.song);
  await markReviewed(state.song);
  render();
}

// --- Render: cabecera + pestañas ---

function renderHeader(container) {
  const reviewed = state.locallyReviewed;
  const badge = el('span', { className: 'badge' }, [reviewed ? 'REVISADO (local)' : `${state.song.timing.status === 'reviewed' ? 'reviewed (documento)' : 'ESTIMADO'} — sin confirmar en este navegador`]);
  container.appendChild(el('h2', {}, [`Editar: ${state.song.metadata.title}`]));
  container.appendChild(el('p', {}, [
    `${state.song.metadata.artist || 'Artista desconocido'} · ${state.song.metadata.key || '—'} · ${state.song.metadata.bpm} BPM · `,
    badge,
  ]));
}

function renderTabBar(container) {
  const tabs = [['metadata', '📋 Metadatos'], ['structure', '🎵 Estructura'], ['audio', '🎧 Audio']];
  const bar = el('div', { className: 'editor-tabs' });
  tabs.forEach(([key, label]) => {
    bar.appendChild(el('button', {
      className: `editor-tab${state.activeTab === key ? ' active' : ''}`,
      onclick: () => { state.activeTab = key; render(); },
    }, [label]));
  });
  container.appendChild(bar);
}

function formGroup(labelText, input) {
  return el('div', { className: 'form-group' }, [el('label', {}, [labelText]), input]);
}

function renderMetadataTab(container) {
  const box = el('div', {});
  const md = state.song.metadata;

  const titleInput = el('input', { type: 'text', className: 'form-input', value: md.title, onchange: (e) => { md.title = e.target.value; state.dirty = true; } });
  const artistInput = el('input', { type: 'text', className: 'form-input', value: md.artist, onchange: (e) => { md.artist = e.target.value; state.dirty = true; } });
  const keyInput = el('input', {
    type: 'text', className: 'form-input', value: md.key || '', placeholder: 'C, Eb, F#m, Am… vacío = desconocida',
    onchange: (e) => { md.key = e.target.value.trim() || null; state.dirty = true; },
  });
  const bpmInput = el('input', {
    type: 'number', className: 'form-input', value: String(md.bpm), min: '1', step: '0.1',
    onchange: (e) => { const v = Number(e.target.value); if (v > 0) { md.bpm = v; state.dirty = true; } },
  });
  const numInput = el('input', {
    type: 'number', className: 'form-input-sm', value: String(md.timeSignature.numerator), min: '1', max: '32', style: 'width:70px',
    onchange: (e) => { md.timeSignature.numerator = Math.max(1, Math.min(32, Math.round(Number(e.target.value)) || 1)); state.dirty = true; },
  });
  const denomSelect = el('select', { className: 'form-input-sm', style: 'width:90px' });
  TIME_SIGNATURE_DENOMINATORS.forEach((d) => denomSelect.appendChild(el('option', { value: String(d) }, [String(d)])));
  denomSelect.value = String(md.timeSignature.denominator);
  denomSelect.onchange = (e) => { md.timeSignature.denominator = Number(e.target.value); state.dirty = true; };

  box.appendChild(formGroup('Título', titleInput));
  box.appendChild(formGroup('Artista', artistInput));
  box.appendChild(formGroup('Tonalidad', keyInput));
  box.appendChild(formGroup('BPM (negras/minuto)', bpmInput));
  box.appendChild(formGroup('Compás', el('div', { style: 'display:flex;gap:8px;align-items:center' }, [numInput, el('span', {}, ['/']), denomSelect])));
  box.appendChild(el('p', { className: 'help-text' }, ['El BPM y el compás describen la rejilla de referencia; no cambian un audio ya vinculado, y solo se pueden editar mientras el transporte está en pausa/detenido.']));

  container.appendChild(box);
}

function renderChordRow(chord) {
  const symbolInput = el('input', { type: 'text', className: 'form-input-sm', value: chord.symbol, style: 'width:80px', onchange: (e) => { chord.symbol = e.target.value; state.dirty = true; } });
  const bassInput = el('input', { type: 'text', className: 'form-input-sm', value: chord.bassNote || '', placeholder: 'bajo', style: 'width:55px', onchange: (e) => { chord.bassNote = e.target.value.trim() || null; state.dirty = true; } });
  const startInput = el('input', { type: 'number', className: 'form-input-sm', value: String(chord.startMs), style: 'width:70px', onchange: (e) => { chord.startMs = Number(e.target.value) || 0; state.dirty = true; } });
  const endInput = el('input', { type: 'number', className: 'form-input-sm', value: String(chord.endMs), style: 'width:70px', onchange: (e) => { chord.endMs = Number(e.target.value) || 0; state.dirty = true; } });
  const markStart = el('button', { className: 'btn-tiny', onclick: () => { chord.startMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; render(); } }, ['⏱']);
  const markEnd = el('button', { className: 'btn-tiny', onclick: () => { chord.endMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; render(); } }, ['⏱']);
  const removeBtn = el('button', { className: 'btn-tiny btn-danger', 'data-role': 'remove-chord', 'data-chord-id': chord.id, onclick: () => removeChord(chord) }, ['×']);
  return el('div', { className: 'chord-row', 'data-chord-id': chord.id, style: 'display:flex;gap:4px;align-items:center;margin-bottom:3px;font-size:0.85em' }, [
    symbolInput, bassInput, startInput, markStart, endInput, markEnd, removeBtn,
  ]);
}

function renderLineBlock(line) {
  const lineDiv = el('div', { className: 'editor-line', 'data-line-id': line.id });
  const textInput = el('input', { type: 'text', className: 'form-input', style: 'flex:1;min-width:120px', value: line.text, onchange: (e) => { line.text = e.target.value; state.dirty = true; } });
  const startInput = el('input', { type: 'number', className: 'form-input-sm', value: String(line.startMs), style: 'width:75px', onchange: (e) => { line.startMs = Number(e.target.value) || 0; state.dirty = true; } });
  const endInput = el('input', { type: 'number', className: 'form-input-sm', value: String(line.endMs), style: 'width:75px', onchange: (e) => { line.endMs = Number(e.target.value) || 0; state.dirty = true; } });
  const markStart = el('button', { className: 'btn-tiny', onclick: () => { line.startMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; render(); } }, ['⏱ inicio']);
  const markEnd = el('button', { className: 'btn-tiny', onclick: () => { line.endMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; render(); } }, ['⏱ fin']);
  const checkbox = el('input', { type: 'checkbox', 'data-row-id': line.id });
  const removeBtn = el('button', { className: 'btn-tiny btn-danger', 'data-role': 'remove-line', 'data-line-id': line.id, onclick: () => removeLine(line) }, ['🗑️']);

  lineDiv.appendChild(el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
    checkbox, textInput, startInput, markStart, endInput, markEnd, removeBtn,
  ]));

  const chords = state.song.chords.filter((c) => c.anchor && c.anchor.lineId === line.id).sort((a, b) => a.startMs - b.startMs);
  lineDiv.appendChild(el('div', { className: 'chords-editor', style: 'padding-left:20px;margin-top:4px' }, chords.map((c) => renderChordRow(c))));

  const newChordSymbol = el('input', { type: 'text', className: 'form-input-sm', placeholder: 'Acorde (ej: Am)', style: 'width:100px' });
  const newChordDuration = el('input', { type: 'number', className: 'form-input-sm', value: '1000', style: 'width:75px' });
  lineDiv.appendChild(el('div', { style: 'padding-left:20px;display:flex;gap:6px;align-items:center;margin-top:4px' }, [
    newChordSymbol, el('span', { style: 'font-size:0.8em;color:#6b7280' }, ['dur.(ms)']), newChordDuration,
    el('button', { className: 'btn-tiny btn-add', 'data-role': 'add-chord', 'data-line-id': line.id, onclick: () => addChordToLine(line, newChordSymbol.value, Number(newChordDuration.value) || 1000) }, ['+ Acorde']),
  ]));

  return lineDiv;
}

function renderSectionBlock(section) {
  const secDiv = el('div', { className: 'editor-section', 'data-section-id': section.id });
  const typeSelect = el('select', { className: 'form-input-sm' });
  SECTION_TYPES.forEach((t) => typeSelect.appendChild(el('option', { value: t }, [t])));
  typeSelect.value = section.type;
  typeSelect.onchange = (e) => { section.type = e.target.value; state.dirty = true; };
  const labelInput = el('input', { type: 'text', className: 'form-input-sm', value: section.label, onchange: (e) => { section.label = e.target.value; state.dirty = true; } });
  const rangeSpan = el('span', { style: 'font-family:monospace;color:#6b7280;font-size:0.85em' }, [`${section.startMs}–${section.endMs}ms`]);
  const removeBtn = el('button', { className: 'btn-small btn-danger', 'data-role': 'remove-section', 'data-section-id': section.id, onclick: () => removeSection(section) }, ['🗑️ sección']);

  secDiv.appendChild(el('div', { className: 'section-header-editor' }, [typeSelect, labelInput, rangeSpan, removeBtn]));

  const sectionChords = state.song.chords
    .filter((c) => !c.anchor && c.startMs >= section.startMs && c.startMs < section.endMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (sectionChords.length > 0) {
    secDiv.appendChild(el('div', { style: 'margin:6px 0;padding-left:15px;border-left:2px solid #ffd700' }, [
      el('div', { style: 'font-size:0.75em;color:#6b7280' }, ['Acordes de sección (sin letra):']),
      ...sectionChords.map((c) => renderChordRow(c)),
    ]));
  }

  const lines = state.song.lines.filter((l) => l.sectionId === section.id).sort((a, b) => a.startMs - b.startMs);
  lines.forEach((line) => secDiv.appendChild(renderLineBlock(line)));

  const newLineText = el('input', { type: 'text', className: 'form-input', style: 'flex:1;min-width:120px', placeholder: 'Texto de la nueva línea' });
  const newLineDuration = el('input', { type: 'number', className: 'form-input-sm', value: '2000', style: 'width:80px' });
  secDiv.appendChild(el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap' }, [
    newLineText, el('span', { style: 'font-size:0.8em;color:#6b7280' }, ['dur.(ms)']), newLineDuration,
    el('button', { className: 'btn-small', 'data-role': 'add-line', 'data-section-id': section.id, onclick: () => addLineToSection(section, newLineText.value, Number(newLineDuration.value) || 2000) }, ['+ Línea']),
  ]));

  return secDiv;
}

function renderStructureTab(container) {
  const box = el('div', {});

  const shiftInput = el('input', { type: 'number', className: 'form-input-sm', value: '100', style: 'width:80px' });
  box.appendChild(el('div', { style: 'margin-bottom:12px' }, [
    'Desplazar filas marcadas (ms): ', shiftInput,
    el('button', { className: 'btn-small', onclick: () => shiftSelected(Number(shiftInput.value) || 0) }, ['+']),
    el('button', { className: 'btn-small', onclick: () => shiftSelected(-(Number(shiftInput.value) || 0)) }, ['-']),
  ]));

  const sections = [...state.song.sections].sort((a, b) => a.startMs - b.startMs);
  sections.forEach((section) => box.appendChild(renderSectionBlock(section)));

  const newType = el('select', { id: 'new-section-type' });
  SECTION_TYPES.forEach((t) => newType.appendChild(el('option', { value: t }, [t])));
  newType.value = 'verse';
  const newLabel = el('input', { type: 'text', className: 'form-input-sm', id: 'new-section-label', placeholder: 'Etiqueta (ej: VERSO 2)' });
  const newDuration = el('input', { type: 'number', className: 'form-input-sm', id: 'new-section-duration', value: '8000', style: 'width:90px' });
  box.appendChild(el('div', { className: 'editor-section', style: 'border-style:dashed' }, [
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
      el('strong', {}, ['+ Agregar sección al final:']), newType, newLabel,
      el('span', { style: 'font-size:0.8em;color:#6b7280' }, ['duración (ms)']), newDuration,
      el('button', { className: 'btn-small btn-add', id: 'btn-add-section', onclick: () => addSectionAtEnd(newType.value, newLabel.value, Number(newDuration.value) || 8000) }, ['Agregar']),
    ]),
  ]));

  container.appendChild(box);
}

function renderAudioTab(container) {
  const box = el('div', {});
  const currentLabel = state.pendingAssetMeta
    ? `Nuevo archivo elegido (sin guardar): ${state.pendingAssetMeta.name}`
    : state.song.audio
      ? (state.mediaMissing ? 'Audio vinculado pero no se pudo cargar el asset guardado' : 'Audio vinculado')
      : 'Sin audio vinculado — modo manual';
  box.appendChild(el('p', {}, [currentLabel]));

  box.appendChild(el('input', {
    type: 'file', accept: 'audio/*',
    onchange: async (e) => { const f = e.target.files[0]; if (f) await handlePickFile(f); },
  }));

  if (state.song.audio) {
    const offsetInput = el('input', {
      type: 'number', className: 'form-input-sm', value: String(state.song.audio.offsetMs), style: 'width:100px',
      onchange: (e) => { state.song.audio.offsetMs = Math.max(0, Number(e.target.value) || 0); state.dirty = true; },
    });
    box.appendChild(el('div', { style: 'margin-top:10px' }, [el('label', {}, [' Offset (ms, prefijo del archivo antes del inicio de la canción): ', offsetInput])]));
  }

  const loopABtn = el('button', { className: 'btn-tiny', onclick: () => { state.loopA = Math.round(state.transport.getSnapshot().positionMs); renderAudioTabLoopStatus(); } }, ['Marcar A']);
  const loopBBtn = el('button', { className: 'btn-tiny', onclick: () => { state.loopB = Math.round(state.transport.getSnapshot().positionMs); renderAudioTabLoopStatus(); } }, ['Marcar B']);
  const loopStatus = el('span', { id: 'loop-status', style: 'font-family:monospace;color:#6b7280;margin-left:8px' }, [loopStatusText()]);
  const loopToggle = el('label', { style: 'margin-left:8px' }, [
    el('input', { type: 'checkbox', checked: state.loopEnabled, onchange: (e) => { state.loopEnabled = e.target.checked; } }),
    ' Loop A/B activo (ensayo)',
  ]);
  box.appendChild(el('div', { style: 'margin-top:14px;display:flex;align-items:center;flex-wrap:wrap;gap:4px' }, [loopABtn, loopBBtn, loopToggle, loopStatus]));

  const volumeInput = el('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(state.volume ?? 1),
    oninput: (e) => { state.volume = Number(e.target.value); if (state.transport.getSnapshot().mode === 'audio') adapterCall('setVolume', state.volume); },
  });
  const muteBtn = el('button', { className: 'btn-tiny', onclick: () => { state.muted = !state.muted; adapterCall('setMuted', state.muted); render(); } }, [state.muted ? '🔇' : '🔊']);
  box.appendChild(el('div', { style: 'margin-top:10px;display:flex;align-items:center;gap:8px' }, [muteBtn, volumeInput]));

  container.appendChild(box);
}

function loopStatusText() {
  const a = state.loopA !== null ? fmtMs(state.loopA) : '—';
  const b = state.loopB !== null ? fmtMs(state.loopB) : '—';
  return `A=${a} B=${b}`;
}
function renderAudioTabLoopStatus() {
  const el2 = document.getElementById('loop-status');
  if (el2) el2.textContent = loopStatusText();
}

function render() {
  const container = document.getElementById('calibration-view');
  container.innerHTML = '';
  const wrap = el('div', { style: 'padding:20px;max-width:960px;margin:0 auto;color:#111' });

  renderHeader(wrap);
  if (state.song.reviewWarnings?.length) {
    const warnings = el('aside', { className: 'audio-draft-review-warnings', 'aria-label': 'Advertencias del borrador' });
    warnings.appendChild(el('strong', {}, ['Revisión necesaria antes de declarar esta canción revisada:']));
    const list = el('ul');
    state.song.reviewWarnings.forEach((warning) => list.appendChild(el('li', {}, [warning])));
    warnings.appendChild(list);
    wrap.appendChild(warnings);
  }
  wrap.appendChild(el('div', { id: 'calib-transport-bar', style: 'margin:12px 0;padding:10px;background:#f3f4f6;border-radius:8px' }));
  renderTabBar(wrap);

  if (state.activeTab === 'metadata') renderMetadataTab(wrap);
  else if (state.activeTab === 'audio') renderAudioTab(wrap);
  else renderStructureTab(wrap);

  wrap.appendChild(el('div', { className: 'modal-actions' }, [
    el('button', { className: 'btn-primary', onclick: handleSave }, ['💾 Guardar']),
    el('button', { className: 'btn-secondary', onclick: handleDeclareReviewed }, ['✔ Declarar revisado']),
    el('button', { className: 'btn-secondary', onclick: () => close() }, ['Cerrar']),
  ]));

  container.appendChild(wrap);
  renderTransportBar();
}

/**
 * @param {object} song documento v2 completo (se trabaja sobre una copia)
 * @param {() => void} onClose llamado al cerrar el editor
 */
export async function openCalibrationEditor(song, onClose) {
  state = {
    song: JSON.parse(JSON.stringify(song)),
    transport: null,
    activeTab: 'structure',
    pendingBlob: null,
    pendingAssetMeta: null,
    loopA: null,
    loopB: null,
    loopEnabled: false,
    volume: 1,
    muted: false,
    dirty: false,
    onClose,
  };
  state.locallyReviewed = await isLocallyReviewed(state.song);
  document.getElementById('app').style.display = 'none';
  document.getElementById('calibration-view').style.display = 'block';
  await mountTransport();
  render();
}

function close() {
  state?.transport?.dispose();
  const onClose = state?.onClose;
  document.getElementById('calibration-view').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  state = null;
  onClose?.();
}
