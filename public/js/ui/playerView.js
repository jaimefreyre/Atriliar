/**
 * Real playback wired to the prompter (C4): picks audio mode when the song
 * has a loadable asset, generated-click mode otherwise, drives the actual
 * transport, and re-renders the prompter on every snapshot. Fullscreen/
 * Wake Lock/pedal/setlist/panels are stage-mode concerns for later
 * checkpoints — this is the reading screen on its own, in rehearsal mode.
 */

import { getAsset } from '../data/indexedDb.js';
import { isLocallyReviewed } from '../data/reviewState.js';
import { createTransport } from '../transport/transport.js';
import { createAudioTrackAdapter } from '../transport/audioTrack.js';
import { createGeneratedBackingAdapter } from '../transport/generatedBacking.js';
import { createManualAdapter } from '../transport/manual.js';
import { createInputActionListener, ACTIONS } from '../stage/inputActions.js';
import { getBlocks, getActiveBlockIndex } from '../timeline/selectors.js';
import { renderPrompter } from '../rendering/prompter.js';
import { el } from './dom.js';

let current = null; // { song, transport, inputListener, transposeSemitones, fontScalePercent, locallyReviewed, audioCtx }

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

function renderChrome(container) {
  container.innerHTML = '';
  const wrap = el('div', { style: 'max-width:900px;margin:0 auto;padding:16px' });
  wrap.appendChild(el('h2', { style: 'color:#fff' }, [current.song.metadata.title]));
  if (current.fallback) {
    wrap.appendChild(el('p', { style: 'color:#f2b45a;font-size:0.85em' }, ['Audio vinculado no disponible: reproduciendo con base generada.']));
  }
  const screen = el('div', { className: 'prompter-screen', id: 'prompter-screen' });
  wrap.appendChild(screen);

  const controls = el('div', { style: 'margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' });
  const playBtn = el('button', { className: 'btn-sm', id: 'player-play' }, ['▶ Play']);
  const stopBtn = el('button', { className: 'btn-sm', onclick: () => current.transport.stop() }, ['■ Stop']);
  const seek = el('input', { type: 'range', min: '0', max: String(current.song.durationMs), id: 'player-seek', style: 'width:240px' });
  const timeLabel = el('span', { id: 'player-time', style: 'color:#eee;font-family:monospace' }, ['0:00 / 0:00']);
  playBtn.onclick = () => {
    const snap = current.transport.getSnapshot();
    if (snap.state === 'playing') current.transport.pause(); else current.transport.play();
  };
  seek.oninput = (e) => current.transport.seek(Number(e.target.value));
  controls.appendChild(playBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(seek);
  controls.appendChild(timeLabel);
  wrap.appendChild(controls);

  const fineControls = el('div', { style: 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' });
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustFont(-10) }, ['A−']));
  fineControls.appendChild(el('span', { id: 'player-font', style: 'color:#ccc;font-size:0.8em' }, ['100%']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustFont(10) }, ['A+']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustTranspose(-1) }, ['T−']));
  fineControls.appendChild(el('span', { id: 'player-transpose', style: 'color:#ccc;font-size:0.8em' }, ['+0']));
  fineControls.appendChild(el('button', { className: 'btn-tiny', onclick: () => adjustTranspose(1) }, ['T+']));
  wrap.appendChild(fineControls);

  const closeBtn = el('button', { className: 'btn-secondary', style: 'margin-top:16px', onclick: close }, ['Cerrar']);
  wrap.appendChild(closeBtn);

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
  current = {
    song, transport, fallback, audioCtx,
    transposeSemitones: 0, fontScalePercent: 100,
    locallyReviewed: await isLocallyReviewed(song),
    onClose,
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
