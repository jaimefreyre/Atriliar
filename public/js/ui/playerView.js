/**
 * Real playback wired to the prompter (C4) plus the harmony (diapasón +
 * escalas) and tablature panels (C5), all in the one reading/performance
 * view — per direction, this absorbs stageMode.js's (v1) panel features
 * into the v2 view instead of building a second, competing "stage" UI.
 * Fullscreen/Wake Lock are still pending in C9; multi-song setlists remain deferred.
 */

import { getAsset } from '../data/indexedDb.js';
import { isLocallyReviewed } from '../data/reviewState.js';
import { createTransport } from '../transport/transport.js';
import { createAudioTrackAdapter } from '../transport/audioTrack.js';
import { createGeneratedBackingAdapter } from '../transport/generatedBacking.js';
import { createInputActionListener, ACTIONS } from '../stage/inputActions.js';
import { getBlocks, getActiveBlockIndex, getActiveChord, getActiveTab } from '../timeline/selectors.js';
import { renderPrompter } from '../rendering/prompter.js';
import { renderFretboard, renderPiano, setActiveScale } from '../rendering/chordDiagram.js';
import { renderAsciiTab } from '../rendering/tabRenderer.js';
import { SCALES, SCALE_CATEGORIES } from '../music/scales.js';
import { transposeChordSymbol } from '../music/harmony.js';
import { el } from './dom.js';
import { openPerformanceEvaluator } from './performanceEvaluator.js';

const NOTE_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let current = null;
/* {
  song, transport, inputListener, transposeSemitones, fontScalePercent, locallyReviewed, audioCtx, fallback,
  harmonyVisible, tabVisible, scaleRoot, scaleId, layers: {root,chord,bass,scale}
} */

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = (s % 60).toString().padStart(2, '0');
  return `${m}:${rem}`;
}

async function buildTransport(song) {
  if (song.audio) {
    const asset = await getAsset(song.audio.assetId);
    if (asset) {
      const adapter = createAudioTrackAdapter({ blob: asset.blob, offsetMs: song.audio.offsetMs, volume: 1 });
      return { transport: createTransport({ mode: 'audio', durationMs: song.durationMs, adapter }), fallback: false };
    }
  }
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const adapter = createGeneratedBackingAdapter({ audioContext: audioCtx, metadata: song.metadata, volume: 0.4 });
  return { transport: createTransport({ mode: 'generated', durationMs: song.durationMs, adapter }), fallback: !!song.audio, audioCtx };
}

function renderTransportControls() {
  const wrap = el('div');
  const controls = el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' });
  const playBtn = el('button', { className: 'btn-sm', id: 'player-play' }, ['▶ Play']);
  const stopBtn = el('button', { className: 'btn-sm', onclick: () => current.transport.stop() }, ['■ Stop']);
  const seek = el('input', { type: 'range', min: '0', max: String(current.song.durationMs), id: 'player-seek', style: 'width:240px' });
  const timeLabel = el('span', { id: 'player-time', style: 'color:#eee;font-family:monospace' }, ['0:00 / 0:00']);
  playBtn.onclick = () => {
    const snap = current.transport.getSnapshot();
    if (snap.state === 'playing') current.transport.pause(); else current.transport.play();
  };
  seek.oninput = (e) => current.transport.seek(Number(e.target.value));
  [playBtn, stopBtn, seek, timeLabel].forEach((n) => controls.appendChild(n));
  wrap.appendChild(controls);

  const fineControls = el('div', { style: 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' });
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustFont(-10) }, ['A−']));
  fineControls.appendChild(el('span', { id: 'player-font', style: 'color:#ccc;font-size:0.8em' }, ['100%']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustFont(10) }, ['A+']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustTranspose(-1) }, ['T−']));
  fineControls.appendChild(el('span', { id: 'player-transpose', style: 'color:#ccc;font-size:0.8em' }, ['+0']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustTranspose(1) }, ['T+']));
  fineControls.appendChild(el('button', {
    className: 'btn-tiny', onclick: () => togglePanel('harmonyVisible'),
  }, ['♮ Diapasón']));
  fineControls.appendChild(el('button', {
    className: 'btn-tiny', onclick: () => togglePanel('tabVisible'),
  }, ['≋ Tablatura']));
  fineControls.appendChild(el('button', {
    className: 'btn-tiny', id: 'player-evaluate', onclick: () => openPerformanceEvaluator({
      song: current.song,
      transport: current.transport,
      onClose: () => document.getElementById('player-evaluate')?.focus(),
    }),
  }, ['🎙 Evaluar ritmo']));
  wrap.appendChild(fineControls);
  return wrap;
}

function renderHarmonyPanel() {
  const panel = el('section', { className: 'panel', id: 'harmony-panel', style: 'margin-top:12px' });
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #303936' }, [
    el('strong', { style: 'color:#eee;font-size:0.9em' }, ['Diapasón y armonía']),
    el('button', { className: 'btn-tiny', onclick: () => togglePanel('harmonyVisible') }, ['✕']),
  ]);
  panel.appendChild(header);

  const scaleRootSelect = el('select', { id: 'scale-root-select', style: 'margin-right:6px' });
  NOTE_ROOTS.forEach((note, idx) => {
    scaleRootSelect.appendChild(el('option', { value: String(idx) }, [note]));
  });
  scaleRootSelect.value = String(NOTE_ROOTS.indexOf(current.scaleRoot));
  scaleRootSelect.onchange = (e) => { current.scaleRoot = NOTE_ROOTS[Number(e.target.value)]; renderFrame(); };

  const scaleSelect = el('select', { id: 'scale-select' });
  scaleSelect.appendChild(el('option', { value: 'none' }, ['— Ninguna —']));
  SCALE_CATEGORIES.forEach((cat) => {
    const group = el('optgroup', { label: cat });
    Object.entries(SCALES).forEach(([id, def]) => {
      if (def.category === cat) group.appendChild(el('option', { value: id }, [def.name]));
    });
    scaleSelect.appendChild(group);
  });
  scaleSelect.value = current.scaleId;
  scaleSelect.onchange = (e) => { current.scaleId = e.target.value; renderFrame(); };

  const scaleRow = el('div', { style: 'display:flex;gap:8px;align-items:center;padding:10px 14px;flex-wrap:wrap' }, [
    el('label', { style: 'color:#a6b1aa;font-size:0.8em' }, ['Tónica ', scaleRootSelect]),
    el('label', { style: 'color:#a6b1aa;font-size:0.8em' }, ['Escala ', scaleSelect]),
  ]);
  panel.appendChild(scaleRow);

  panel.appendChild(el('div', { id: 'player-fretboard', style: 'padding:0 14px' }));
  panel.appendChild(el('div', { id: 'player-piano', style: 'padding:8px 14px' }));

  const legend = el('div', { id: 'player-legend', style: 'display:flex;gap:10px;flex-wrap:wrap;padding:8px 14px;font-size:0.75em;color:#bec9be' });
  const layerCheckbox = (key, labelText) => {
    const input = el('input', {
      type: 'checkbox', checked: current.layers[key],
      onchange: (e) => { current.layers[key] = e.target.checked; renderFrame(); },
    });
    return el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [input, labelText]);
  };
  legend.appendChild(layerCheckbox('root', '◉ Fundamental'));
  legend.appendChild(layerCheckbox('chord', '● Acorde'));
  legend.appendChild(layerCheckbox('bass', '□ Bajo'));
  legend.appendChild(layerCheckbox('scale', '· Escala'));
  panel.appendChild(legend);

  return panel;
}

function renderTabPanel() {
  const panel = el('section', { className: 'panel', id: 'tab-panel', style: 'margin-top:12px' });
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #303936' }, [
    el('strong', { style: 'color:#eee;font-size:0.9em' }, ['Tablatura']),
    el('button', { className: 'btn-tiny', onclick: () => togglePanel('tabVisible') }, ['✕']),
  ]);
  panel.appendChild(header);
  panel.appendChild(el('div', { id: 'player-tab', style: 'padding:10px 14px' }));
  return panel;
}

function togglePanel(key) {
  current[key] = !current[key];
  renderChrome(document.getElementById('player-view'));
  renderFrame();
}

function renderChrome(container) {
  container.innerHTML = '';
  const wrap = el('div', { style: 'max-width:960px;margin:0 auto;padding:16px' });
  wrap.appendChild(el('h2', { style: 'color:#fff' }, [current.song.metadata.title]));
  if (current.fallback) {
    wrap.appendChild(el('p', { style: 'color:#f2b45a;font-size:0.85em' }, ['Audio vinculado no disponible: reproduciendo con base generada.']));
  }
  wrap.appendChild(el('div', { className: 'prompter-screen', id: 'prompter-screen' }));
  wrap.appendChild(renderTransportControls());
  if (current.harmonyVisible) wrap.appendChild(renderHarmonyPanel());
  if (current.tabVisible) wrap.appendChild(renderTabPanel());
  wrap.appendChild(el('button', { className: 'btn-secondary', style: 'margin-top:16px', onclick: close }, ['Cerrar']));
  container.appendChild(wrap);
}

function renderFrame() {
  const snap = current.transport.getSnapshot();
  document.getElementById('player-time').textContent = `${fmtMs(snap.positionMs)} / ${fmtMs(snap.durationMs)} [${snap.state}]`;
  document.getElementById('player-seek').value = String(Math.round(snap.positionMs));
  const playBtn = document.getElementById('player-play');
  if (playBtn) playBtn.textContent = snap.state === 'playing' ? '⏸ Pausa' : '▶ Play';

  renderPrompter(document.getElementById('prompter-screen'), {
    song: current.song,
    positionMs: snap.positionMs,
    transposeSemitones: current.transposeSemitones,
    mode: 'rehearsal',
    locallyReviewed: current.locallyReviewed,
  });

  if (current.harmonyVisible) {
    const chordEvent = getActiveChord(current.song, snap.positionMs);
    const symbol = chordEvent ? transposeChordSymbol(chordEvent.symbol, current.transposeSemitones) : null;
    const bass = chordEvent && chordEvent.bassNote
      ? transposeChordSymbol(chordEvent.bassNote, current.transposeSemitones)
      : (chordEvent ? null : undefined);
    setActiveScale(current.scaleRoot, current.scaleId);
    const fret = document.getElementById('player-fretboard');
    const piano = document.getElementById('player-piano');
    if (fret) renderFretboard(fret, symbol || '', current.layers, bass);
    if (piano) renderPiano(piano, symbol || '', current.layers, bass);
  }

  if (current.tabVisible) {
    const tabEvent = getActiveTab(current.song, snap.positionMs);
    renderAsciiTab(document.getElementById('player-tab'), tabEvent);
  }
}

function adjustFont(delta) {
  current.fontScalePercent = Math.max(70, Math.min(140, current.fontScalePercent + delta));
  document.getElementById('player-font').textContent = `${current.fontScalePercent}%`;
  document.documentElement.style.setProperty('--lyric-size', `clamp(${2 * current.fontScalePercent / 100}rem, ${3.4 * current.fontScalePercent / 100}vw, ${4.8 * current.fontScalePercent / 100}rem)`);
}

function adjustTranspose(delta) {
  current.transposeSemitones += delta;
  document.getElementById('player-transpose').textContent = current.transposeSemitones >= 0 ? `+${current.transposeSemitones}` : String(current.transposeSemitones);
  renderFrame();
}

function handleInputAction(action) {
  const t = current.transport;
  if (action === ACTIONS.TOGGLE_PLAY) {
    const snap = t.getSnapshot();
    if (snap.state === 'playing') t.pause(); else t.play();
  } else if (action === ACTIONS.NEXT_BLOCK || action === ACTIONS.PREV_BLOCK) {
    const blocks = getBlocks(current.song);
    const idx = getActiveBlockIndex(blocks, t.getSnapshot().positionMs);
    const targetIdx = action === ACTIONS.NEXT_BLOCK
      ? Math.min(blocks.length - 1, (idx === -1 ? 0 : idx + 1))
      : Math.max(0, (idx === -1 ? 0 : idx - 1));
    const block = blocks[targetIdx];
    if (block) t.seek(block.startMs);
  } else if (action === ACTIONS.EXIT_STAGE) {
    close();
  }
}

/** @param {object} song documento v2 (asume ya validado) */
export async function openPlayerView(song, onClose) {
  const container = document.getElementById('player-view');
  const { transport, fallback, audioCtx } = await buildTransport(song);
  const defaultRoot = (song.metadata.key || 'C').replace(/m$/, '');
  current = {
    song, transport, fallback, audioCtx,
    transposeSemitones: 0, fontScalePercent: 100,
    locallyReviewed: await isLocallyReviewed(song),
    onClose,
    harmonyVisible: true, tabVisible: true,
    scaleRoot: NOTE_ROOTS.includes(defaultRoot) ? defaultRoot : 'C',
    scaleId: 'none',
    layers: { root: true, chord: true, bass: true, scale: true },
    inputListener: createInputActionListener({ onAction: handleInputAction, target: container }),
  };
  container.tabIndex = -1;
  document.getElementById('app').style.display = 'none';
  container.style.display = 'block';
  renderChrome(container);
  transport.subscribe(renderFrame);
  renderFrame();
  container.focus();
}

function close() {
  current?.transport?.dispose();
  current?.inputListener?.dispose();
  if (current?.audioCtx) current.audioCtx.close().catch(() => {});
  const onClose = current?.onClose;
  const container = document.getElementById('player-view');
  container.style.display = 'none';
  container.innerHTML = '';
  document.getElementById('app').style.display = 'block';
  current = null;
  onClose?.();
}
