/**
 * Sync/calibration editor (REQ-02/REQ-04, S4): link a real local audio file,
 * play it through the real transport, and correct section/line marks by
 * listening — not by trusting the grid-estimated timing blindly. Saving
 * always re-validates the whole document (validateSongV2) before it can
 * reach IndexedDB; "declarar revisado" is the only thing that ever grants
 * local trust (reviewState.js), and it always re-hashes the exact persisted
 * document, never the claim a JSON import carried in.
 */

import { getAsset, saveSongV2, saveSongV2WithAsset } from '../data/indexedDb.js';
import { validateSongV2 } from '../data/songValidator.js';
import { markReviewed, isLocallyReviewed } from '../data/reviewState.js';
import { createTransport } from '../transport/transport.js';
import { createAudioTrackAdapter, checkAudioCoversRange } from '../transport/audioTrack.js';
import { createManualAdapter } from '../transport/manual.js';
import { el } from './dom.js';

/** @type {{song: object, transport: object, pendingBlob: Blob|null, pendingAssetMeta: object|null, loopA: number|null, loopB: number|null, loopEnabled: boolean, onClose: Function|null}|null} */
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
    state.mediaMissing = !!state.song.audio; // había audio referenciado pero no se pudo cargar el asset
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

  const loopABtn = el('button', { className: 'btn-tiny', onclick: () => { state.loopA = Math.round(state.transport.getSnapshot().positionMs); renderTransportBar(); } }, [`A${state.loopA !== null ? `=${fmtMs(state.loopA)}` : ''}`]);
  const loopBBtn = el('button', { className: 'btn-tiny', onclick: () => { state.loopB = Math.round(state.transport.getSnapshot().positionMs); renderTransportBar(); } }, [`B${state.loopB !== null ? `=${fmtMs(state.loopB)}` : ''}`]);
  const loopToggle = el('label', {}, [
    el('input', { type: 'checkbox', ...(state.loopEnabled ? { checked: 'checked' } : {}), onchange: (e) => { state.loopEnabled = e.target.checked; } }),
    ' Loop A/B (ensayo)',
  ]);
  bar.appendChild(document.createElement('br'));
  bar.appendChild(loopABtn);
  bar.appendChild(loopBBtn);
  bar.appendChild(loopToggle);

  const volumeInput = el('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(state.volume ?? 1),
    oninput: (e) => {
      state.volume = Number(e.target.value);
      if (state.transport.getSnapshot().mode === 'audio') adapterCall('setVolume', state.volume);
    },
  });
  const muteBtn = el('button', { className: 'btn-tiny', onclick: () => { state.muted = !state.muted; adapterCall('setMuted', state.muted); renderTransportBar(); } }, [state.muted ? '🔇' : '🔊']);
  bar.appendChild(document.createElement('br'));
  bar.appendChild(muteBtn);
  bar.appendChild(volumeInput);
}

function adapterCall(method, arg) {
  currentAdapterRef?.[method]?.(arg);
}

function allEventsSorted() {
  const rows = [
    ...state.song.sections.map((s) => ({ kind: 'section', ref: s })),
    ...state.song.lines.map((l) => ({ kind: 'line', ref: l })),
  ];
  rows.sort((a, b) => a.ref.startMs - b.ref.startMs);
  return rows;
}

function renderTable() {
  const tbody = document.getElementById('calib-table-body');
  tbody.innerHTML = '';
  allEventsSorted().forEach(({ kind, ref }) => {
    const tr = document.createElement('tr');
    const checkbox = el('input', { type: 'checkbox', 'data-row-id': ref.id });

    const startInput = el('input', {
      type: 'number', className: 'form-input-sm', value: String(ref.startMs), style: 'width:80px',
      onchange: (e) => { ref.startMs = Number(e.target.value) || 0; state.dirty = true; },
    });
    const endInput = el('input', {
      type: 'number', className: 'form-input-sm', value: String(ref.endMs), style: 'width:80px',
      onchange: (e) => { ref.endMs = Number(e.target.value) || 0; state.dirty = true; },
    });
    const markStart = el('button', {
      className: 'btn-tiny', onclick: () => { ref.startMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; renderTable(); },
    }, ['⏱ inicio']);
    const markEnd = el('button', {
      className: 'btn-tiny', onclick: () => { ref.endMs = Math.round(state.transport.getSnapshot().positionMs); state.dirty = true; renderTable(); },
    }, ['⏱ fin']);

    const label = kind === 'section' ? `[${ref.type}] ${ref.label}` : ref.text;
    [
      el('td', {}, [checkbox]),
      el('td', {}, [kind === 'section' ? 'Sección' : 'Línea']),
      el('td', { style: 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [label]),
      el('td', {}, [startInput, markStart]),
      el('td', {}, [endInput, markEnd]),
    ].forEach((td) => tr.appendChild(td));
    tbody.appendChild(tr);
  });
}

function shiftSelected(deltaMs) {
  const checked = new Set(Array.from(document.querySelectorAll('#calib-table-body input[type=checkbox]:checked')).map((c) => c.dataset.rowId));
  if (checked.size === 0) return;
  allEventsSorted().forEach(({ ref }) => {
    if (checked.has(ref.id)) {
      ref.startMs = Math.max(0, ref.startMs + deltaMs);
      ref.endMs = Math.max(ref.startMs + 1, ref.endMs + deltaMs);
    }
  });
  state.dirty = true;
  renderTable();
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
    alert(err.message);
    return;
  }

  const offsetMs = state.song.audio?.offsetMs ?? 0;
  const check = checkAudioCoversRange(tempAudio, offsetMs, state.song.durationMs);
  URL.revokeObjectURL(objectUrl);
  if (!check.ok) {
    alert(`El archivo dura ${Math.round(check.fileDurationMs)}ms y hacen falta ${check.requiredMs}ms (offset + duración de la canción). Elegí otro archivo o ajustá el offset.`);
    return;
  }
  state.pendingBlob = file;
  state.pendingAssetMeta = { name: file.name, mime: file.type || 'application/octet-stream', bytes: file.size, duration: check.fileDurationMs };
  if (!state.song.audio) state.song.audio = { assetId: `asset-${state.song.id}`, offsetMs: 0 };
  state.dirty = true;
  await mountTransport();
  render();
}

/** @returns {Promise<boolean>} false si la validación rechazó el guardado (nada se persistió) */
async function handleSave() {
  const { valid, errors } = validateSongV2(state.song);
  if (!valid) {
    alert('No se puede guardar: \n' + errors.slice(0, 10).map((e) => `${e.instancePath || '/'}: ${e.message}`).join('\n'));
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
  alert('Guardado.');
  render();
  return true;
}

async function handleDeclareReviewed() {
  if (state.dirty) {
    const saved = await handleSave();
    if (!saved) return; // el documento sigue inválido: no se declara revisado nada
  }
  state.song.timing = { ...state.song.timing, status: 'reviewed' };
  await saveSongV2(state.song);
  await markReviewed(state.song);
  render();
}

function renderHeader(container) {
  const reviewed = state.locallyReviewed;
  const badge = el('span', { className: 'badge' }, [reviewed ? 'REVISADO (local)' : `${state.song.timing.status === 'reviewed' ? 'reviewed (documento)' : 'ESTIMADO'} — sin confirmar en este navegador`]);
  container.appendChild(el('h2', {}, [`Calibrar: ${state.song.metadata.title}`]));
  container.appendChild(el('p', {}, [
    `${state.song.metadata.artist || 'Artista desconocido'} · ${state.song.metadata.key || '—'} · ${state.song.metadata.bpm} BPM · `,
    badge,
  ]));
}

function renderAudioSection(container) {
  const box = el('div', { className: 'editor-section' });
  const currentLabel = state.pendingAssetMeta
    ? `Nuevo archivo elegido (sin guardar): ${state.pendingAssetMeta.name}`
    : state.song.audio
      ? (state.mediaMissing ? 'Audio vinculado pero no se pudo cargar el asset guardado' : 'Audio vinculado')
      : 'Sin audio vinculado — modo manual';
  box.appendChild(el('p', {}, [currentLabel]));

  const fileInput = el('input', {
    type: 'file', accept: 'audio/*',
    onchange: async (e) => { const f = e.target.files[0]; if (f) await handlePickFile(f); },
  });
  box.appendChild(fileInput);

  if (state.song.audio) {
    const offsetInput = el('input', {
      type: 'number', className: 'form-input-sm', value: String(state.song.audio.offsetMs), style: 'width:100px',
      onchange: (e) => { state.song.audio.offsetMs = Math.max(0, Number(e.target.value) || 0); state.dirty = true; },
    });
    box.appendChild(el('label', {}, [' Offset (ms, prefijo del archivo antes del inicio de la canción): ', offsetInput]));
  }
  container.appendChild(box);
}

function render() {
  const container = document.getElementById('calibration-view');
  container.innerHTML = '';
  const wrap = el('div', { style: 'padding:20px;max-width:900px;margin:0 auto;color:#111' });

  renderHeader(wrap);
  renderAudioSection(wrap);

  wrap.appendChild(el('div', { id: 'calib-transport-bar', style: 'margin:16px 0;padding:10px;background:#f3f4f6;border-radius:8px' }));

  const shiftInput = el('input', { type: 'number', className: 'form-input-sm', value: '100', style: 'width:80px' });
  const shiftControls = el('div', { style: 'margin-bottom:8px' }, [
    'Desplazar filas marcadas (ms): ', shiftInput,
    el('button', { className: 'btn-small', onclick: () => shiftSelected(Number(shiftInput.value) || 0) }, ['+']),
    el('button', { className: 'btn-small', onclick: () => shiftSelected(-(Number(shiftInput.value) || 0)) }, ['-']),
  ]);
  wrap.appendChild(shiftControls);

  const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:0.9em' }, [
    el('thead', {}, [el('tr', {}, [el('th', {}, ['']), el('th', {}, ['Tipo']), el('th', {}, ['Texto/Etiqueta']), el('th', {}, ['Inicio (ms)']), el('th', {}, ['Fin (ms)'])])]),
    el('tbody', { id: 'calib-table-body' }),
  ]);
  wrap.appendChild(table);

  const actions = el('div', { className: 'modal-actions' }, [
    el('button', { className: 'btn-primary', onclick: handleSave }, ['💾 Guardar']),
    el('button', { className: 'btn-secondary', onclick: handleDeclareReviewed }, ['✔ Declarar revisado']),
    el('button', { className: 'btn-secondary', onclick: () => close() }, ['Cerrar']),
  ]);
  wrap.appendChild(actions);

  container.appendChild(wrap);
  renderTransportBar();
  renderTable();
}

/**
 * @param {object} song documento v2 completo (se trabaja sobre una copia)
 * @param {() => void} onClose llamado al cerrar el editor
 */
export async function openCalibrationEditor(song, onClose) {
  state = {
    song: JSON.parse(JSON.stringify(song)),
    transport: null,
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
