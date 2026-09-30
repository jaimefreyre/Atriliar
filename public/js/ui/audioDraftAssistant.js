import { decodeLocalFile } from '../audio/decodeLocalFile.js';
import { importSongV2Document } from '../data/importSongV2.js';
import { getSongV2, getLabProject, getAsset, saveAsset, saveLabProject, saveLabProjectWithAsset } from '../data/indexedDb.js';
import { openCalibrationEditor } from './calibrationEditor.js';
import { openPlayerView } from './playerView.js';
import { cacheOptionalAudioTools } from '../data/offline.js';
import { createAudioAnalysisVisualizer } from './audioAnalysisVisualizer.js';
import { createMicCapture } from '../audio/micCapture.js';
import { createLiveChordStabilizer } from '../audio/liveChordStabilizer.js';
import { createLivePitchTracker } from '../audio/livePitchTracker.js';
import { expandPitchClassesAcrossOctaves } from '../audio/chordTemplateMatch.js';
import { compareChroma } from '../audio/chromaSimilarity.js';
import { scoreChordChroma } from '../music/chromaMatch.js';
import { getAuditionRange } from '../audio/auditionRange.js';
import { buildHarmonicRegions } from '../audio/harmonicSegmentation.js';
import { initialLabSections, sectionAt, splitLabSection, buildLabSong } from '../audio/labComposition.js';
import { buildWaveformEnvelope } from '../audio/waveformEnvelope.js';
import { createLiveHarmonicRadar } from './harmonicCircle.js';
import { getChordTones } from '../music/harmony.js';
import { createMultitrackWorkspace } from './multitrackWorkspace.js';

const ANALYSIS_WORKER_URL = new URL('../audio/essentiaAnalysisWorker.js', import.meta.url);

function el(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') node.className = value;
    else if (key === 'onClick') node.addEventListener('click', value);
    else node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function createAssetId() {
  const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `asset-${random}`;
}

/** Local-only optional assistant. All audio analysis happens in its module Worker. */
export async function openAudioDraftAssistant({ projectId: existingProjectId = null, songId = null, onClose = () => {} } = {}) {
  if (document.getElementById('audio-draft-assistant')) return;
  cacheOptionalAudioTools().catch(() => {});
  let selectedFile = null;
  let decoded = null;
  let waveform = [];
  let analysis = null;
  let worker = null;
  let mediaUrl = null;
  let mediaPlayer = null;
  let mediaAudioContext = null;
  let mediaAudioSource = null;
  let mediaEqNodes = null;
  let mediaEqPlayer = null;
  let playbackEq = { low: 0, mid: 0, high: 0 };
  let playbackRate = 1;
  let liveCapture = null;
  let liveView = null;
  let liveScores = [];
  let lastLiveSegmentStartMs = null;
  const liveChordStabilizer = createLiveChordStabilizer({ alpha: 0.26, minScore: 0.4, minMargin: 0.025, confirmMs: 340 });
  const livePitchTracker = createLivePitchTracker({ minConfidence: 0.22, confirmMs: 280, releaseMs: 350, frequencyAlpha: 0.2 });
  let liveChordResult = null;
  let currentLiveNote = null;
  let lastPlayheadDrawAt = 0;
  let lastSignalDisplayAt = 0;
  let liveInputQuality = 'low';
  let playheadFrame = null;
  let playheadMediaPlayer = null;
  let auditionEndMs = null;
  let auditionArmed = false;
  let auditionToken = 0;
  let labSections = [];
  let projectId = existingProjectId;
  let projectAudioAssetId = null;
  let pendingAsset = null;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let keyboardHandler = null;
  let multitrackView = null;
  let multitrackState = { stems: [], loop: {} };
  let selectedSectionId = null;
  let linkedSongId = null;
  let busy = false;
  function connectPlaybackEqualizer() {
    if (!mediaPlayer) return;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    try {
      mediaAudioContext ||= new AudioContextType();
      if (mediaEqPlayer !== mediaPlayer) {
        try { mediaAudioSource?.disconnect(); mediaEqNodes?.forEach((filter) => filter.disconnect()); } catch { /* old player is detached */ }
        mediaAudioSource = mediaAudioContext.createMediaElementSource(mediaPlayer);
        const low = mediaAudioContext.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 150;
        const mid = mediaAudioContext.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.Q.value = .8;
        const high = mediaAudioContext.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3500;
        mediaAudioSource.connect(low); low.connect(mid); mid.connect(high); high.connect(mediaAudioContext.destination);
        mediaEqNodes = [low, mid, high]; mediaEqPlayer = mediaPlayer;
        mediaPlayer.addEventListener('play', () => { if (mediaAudioContext?.state === 'suspended') mediaAudioContext.resume().catch(() => {}); });
      }
      if (mediaAudioContext.state === 'suspended') mediaAudioContext.resume().catch(() => {});
      [playbackEq.low, playbackEq.mid, playbackEq.high].forEach((value, index) => {
        mediaEqNodes[index].gain.setTargetAtTime(value, mediaAudioContext.currentTime, .035);
      });
      mediaPlayer.playbackRate = playbackRate;
      if ('preservesPitch' in mediaPlayer) mediaPlayer.preservesPitch = true;
      else if ('webkitPreservesPitch' in mediaPlayer) mediaPlayer.webkitPreservesPitch = true;
    } catch (error) {
      transportStatus.textContent = `Ecualizador de salida no disponible: ${error?.message || 'error de audio'}`;
    }
  }
  const title = el('input', { id: 'audio-draft-title', type: 'text', maxlength: 200, placeholder: 'Título de la canción' });
  const artist = el('input', { id: 'audio-draft-artist', type: 'text', maxlength: 200, placeholder: 'Artista (opcional)' });
  const bpm = el('input', { id: 'audio-draft-bpm', type: 'number', min: 20, max: 300, step: '0.01', placeholder: 'BPM estimado' });
  const file = el('input', { id: 'audio-draft-file', type: 'file', accept: 'audio/*,video/*' });
  const status = el('p', { className: 'audio-draft-status', role: 'status', 'aria-live': 'polite' }, 'Elige un archivo. Se analiza en este dispositivo.');
  const preview = el('pre', { className: 'audio-draft-preview' }, 'Sin análisis todavía.');
  const mediaPreview = el('div', { className: 'audio-study-player' });
  const transportStatus = el('span', { className: 'lab-transport-status', role: 'status', 'aria-live': 'polite' }, 'Carga una pista para escuchar el análisis.');
  const analysisPanel = el('div', { id: 'audio-analysis-panel' });
  analysisPanel.append(el('div', { className: 'lab-empty-map' }, 'Carga una pista y pulsa «Analizar archivo» para construir el mapa del sonido.'));
  const sectionList = el('nav', { className: 'lab-section-list', 'aria-label': 'Secciones de la pieza' });
  const sectionEditor = el('div', { className: 'lab-section-editor' });
  const sectionPanel = el('section', { className: 'lab-section-panel' });
  sectionPanel.append(el('h3', {}, 'Estructura y escritura'),
    el('p', { className: 'lab-help' }, 'Divide la pieza donde está el cursor y escribe letra o tablatura sobre el audio. La estructura se puede ajustar después.'),
    sectionList, sectionEditor);
  const livePanel = el('section', { className: 'audio-live-panel', hidden: 'hidden', 'aria-label': 'Karaoke de análisis en vivo' });
  const liveRadar = createLiveHarmonicRadar();
  const liveNoteCard = el('section', { className: 'live-note-detector', 'aria-live': 'polite', 'aria-label': 'Nota estimada que suena en el micrófono' });
  const liveNoteName = el('strong', { className: 'live-note-name' }, '—');
  const liveNoteInfo = el('span', { className: 'live-note-info' }, 'Esperando señal del micrófono');
  const tunerMeter = el('div', { className: 'live-tuner-meter', role: 'img', 'aria-label': 'Desviación de afinación desde menos 50 a más 50 cents' });
  const tunerTicks = el('div', { className: 'live-tuner-ticks' });
  for (const tick of [-50, -25, 0, 25, 50]) tunerTicks.append(el('span', { className: tick === 0 ? 'is-center' : '' }, `${tick > 0 ? '+' : ''}${tick}`));
  const tunerTrack = el('div', { className: 'live-tuner-track' });
  const tunerCenter = el('span', { className: 'live-tuner-center' });
  const tunerNeedle = el('span', { className: 'live-tuner-needle' });
  tunerTrack.append(tunerCenter, tunerNeedle); tunerMeter.append(tunerTicks, tunerTrack);
  const liveKeyboard = el('div', { className: 'live-tuner-keyboard', role: 'img', 'aria-label': 'Teclado cromático con la nota detectada resaltada' });
  const naturalNotes = [
    { pc: 0, note: 'C' }, { pc: 2, note: 'D' }, { pc: 4, note: 'E' }, { pc: 5, note: 'F' },
    { pc: 7, note: 'G' }, { pc: 9, note: 'A' }, { pc: 11, note: 'B' },
  ];
  naturalNotes.forEach(({ pc, note }, index) => liveKeyboard.append(el('span', { className: 'live-piano-white', 'data-pc': pc, style: `left:${index * (100 / 7)}%;width:${100 / 7}%` }, note)));
  [{ pc: 1, after: 0 }, { pc: 3, after: 1 }, { pc: 6, after: 3 }, { pc: 8, after: 4 }, { pc: 10, after: 5 }]
    .forEach(({ pc, after }) => liveKeyboard.append(el('span', { className: 'live-piano-black', 'data-pc': pc, style: `left:${((after + .68) / 7) * 100}%` })));
  liveNoteCard.append(el('span', { className: 'live-note-label' }, 'AFINADOR · NOTA DEL MICRÓFONO'), liveNoteName, tunerMeter, liveKeyboard, liveNoteInfo);
  const liveSpectrumCard = el('section', { className: 'live-spectrum-card', 'aria-label': 'Espectro de frecuencias captado por el micrófono' });
  liveSpectrumCard.append(el('h4', {}, 'Espectro en vivo · picos y notas'));
  const liveSpectrumReadout = el('div', { className: 'live-spectrum-readout' });
  const liveSpectrumChord = el('div', { className: 'live-spectrum-fingerprint chord' });
  const liveSpectrumChordLabel = el('span', {}, 'ACORDE SUGERIDO');
  const liveSpectrumChordName = el('strong', {}, '—');
  const liveSpectrumChordTones = el('small', {}, 'Esperando evidencia armónica');
  liveSpectrumChord.append(liveSpectrumChordLabel, liveSpectrumChordName, liveSpectrumChordTones);
  const liveSpectrumNote = el('div', { className: 'live-spectrum-fingerprint note' });
  const liveSpectrumNoteLabel = el('span', {}, 'NOTA MÁS CERCANA');
  const liveSpectrumNoteName = el('strong', {}, '—');
  const liveSpectrumNoteInfo = el('small', {}, 'Esperando una fundamental clara');
  liveSpectrumNote.append(liveSpectrumNoteLabel, liveSpectrumNoteName, liveSpectrumNoteInfo);
  liveSpectrumReadout.append(liveSpectrumChord, liveSpectrumNote);
  const liveSpectrumCanvas = el('canvas', { className: 'live-spectrum-canvas', role: 'img', 'aria-label': 'Espectro de frecuencias logarítmico con picos estimados y sus notas' });
  const liveSpectrumCaption = el('p', { className: 'live-spectrum-caption' }, 'Guías azules: cada tono del acorde en todos los registros · amarillo: fundamental y armónicos de la nota estimada · puntos naranjas: picos detectados en el micrófono.');
  liveSpectrumCard.append(liveSpectrumReadout, liveSpectrumCanvas, liveSpectrumCaption);
  const liveVisuals = el('div', { className: 'audio-live-visuals' });
  liveVisuals.append(liveRadar.element, liveNoteCard, liveSpectrumCard);
  const liveStatus = el('p', { className: 'audio-live-status', role: 'status', 'aria-live': 'polite' }, 'Micrófono apagado');
  const micPreferenceKey = 'stageprompter:mic-enabled:v1';
  let micWasEnabled = false;
  try { micWasEnabled = localStorage.getItem(micPreferenceKey) === 'true'; } catch { /* storage may be disabled */ }
  if (micWasEnabled) liveStatus.textContent = 'Micrófono apagado · la sesión anterior lo usaba; pulsa M para reactivar.';
  const liveReference = el('strong', { className: 'audio-live-reference' }, 'Referencia: —');
  const liveTransition = el('strong', { className: 'audio-live-transition' }, 'Secuencia: —');
  const liveGuess = el('strong', { className: 'audio-live-guess' }, 'Escucha: —');
  const liveSimilarity = el('strong', { className: 'audio-live-similarity' }, 'Afinidad armónica: —');
  const liveCompatibility = el('p', { className: 'audio-live-compatibility' }, 'Compatibilidad con el acorde elegido: —');
  const micSwitch = el('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Activar escucha por micrófono' });
  const micSwitchLabel = el('label', { className: 'live-mic-switch' });
  const micSwitchText = el('span', {}, 'Escucha por micrófono');
  const micSwitchState = el('strong', { className: 'live-mic-switch-state', 'aria-live': 'polite' }, 'Apagado');
  micSwitchLabel.append(micSwitch, el('span', { className: 'live-mic-switch-track', 'aria-hidden': 'true' }), micSwitchText, micSwitchState);
  const liveMetrics = el('div', { className: 'audio-live-metrics' });
  liveMetrics.append(liveReference, liveTransition, liveGuess, liveSimilarity);
  liveReference.dataset.liveTool = 'reference';
  liveTransition.dataset.liveTool = 'transition';
  liveGuess.dataset.liveTool = 'chord';
  liveSimilarity.dataset.liveTool = 'affinity';
  liveCompatibility.dataset.liveTool = 'compatibility';
  const liveToolControls = el('nav', { className: 'live-tool-controls', 'aria-label': 'Herramientas visibles de escucha en vivo' });
  const liveToolPrefsKey = 'stageprompter:live-tools:v1';
  const liveToolDefaults = { reference: true, transition: true, chord: true, affinity: true, compatibility: true, radar: true, tuner: true, spectrum: true };
  let liveToolPrefs = {};
  try { liveToolPrefs = JSON.parse(localStorage.getItem(liveToolPrefsKey) || '{}') || {}; } catch { liveToolPrefs = {}; }
  const liveToolState = { ...liveToolDefaults, ...liveToolPrefs };
  const liveToolNodes = new Map([['reference', liveReference], ['transition', liveTransition], ['chord', liveGuess], ['affinity', liveSimilarity], ['compatibility', liveCompatibility], ['radar', liveRadar.element], ['tuner', liveNoteCard], ['spectrum', liveSpectrumCard]]);
  for (const [id, label] of [['reference', 'Referencia'], ['transition', 'Cambio'], ['chord', 'Acorde'], ['affinity', 'Afinidad'], ['compatibility', 'Cotejo'], ['radar', 'Radar'], ['tuner', 'Afinador'], ['spectrum', 'Espectro']]) {
    const button = el('button', { type: 'button', className: 'analysis-panel-toggle', 'aria-pressed': String(liveToolState[id]) }, label);
    button.addEventListener('click', () => {
      liveToolState[id] = !liveToolState[id]; button.setAttribute('aria-pressed', String(liveToolState[id]));
      const target = liveToolNodes.get(id); if (target) target.hidden = !liveToolState[id];
      try { localStorage.setItem(liveToolPrefsKey, JSON.stringify(liveToolState)); } catch { /* storage may be disabled */ }
    });
    liveToolControls.append(button);
  }
  const liveActions = el('footer', { className: 'audio-draft-actions live-actions' });
  const keyboardHint = el('p', { className: 'live-shortcuts' }, 'Atajos: M micrófono · Espacio play/pausa en Loopera · 1 Autopsia · 2 Karaoke · 3 Multipista · 4 Loopera · R cotejo');
  liveActions.append(micSwitchLabel, keyboardHint);
  const referenceToggle = el('label', { className: 'live-reference-toggle' });
  const referencePreferenceKey = 'stageprompter:mic-reference:v1';
  let referenceEnabled = true;
  try { referenceEnabled = localStorage.getItem(referencePreferenceKey) !== 'false'; } catch { /* storage may be disabled */ }
  const referenceCheckbox = el('input', { type: 'checkbox', checked: String(referenceEnabled) });
  referenceToggle.append(referenceCheckbox, el('span', {}, 'Comparar el micrófono con el audio cargado'));
  const analyze = el('button', { type: 'button', className: 'btn-primary' }, 'Analizar archivo');
  const create = el('button', { type: 'button', className: 'btn-primary', disabled: 'true' }, 'Crear canción editable');
  const saveLab = el('button', { type: 'button', className: 'btn-secondary', disabled: 'true' }, 'Guardar laboratorio');
  const closeButton = el('button', { type: 'button', className: 'btn-secondary' }, 'Cerrar');
  const editMode = el('button', { type: 'button', className: 'btn-secondary', disabled: 'true' }, 'Escritura y calibración');
  const stageMode = el('button', { type: 'button', className: 'btn-secondary', disabled: 'true' }, 'Escenario');
  const dialog = el('main', { id: 'audio-draft-assistant', className: 'sound-lab', 'aria-labelledby': 'audio-draft-heading' });
  const heading = el('h1', { id: 'audio-draft-heading' }, 'Laboratorio del sonido');
  const form = el('div', { className: 'audio-draft-form' });
  const fileLabel = el('label', { for: 'audio-draft-file' }, 'Archivo de audio o video'); fileLabel.append(file);
  const titleLabel = el('label', { for: 'audio-draft-title' }, 'Título'); titleLabel.append(title);
  const artistLabel = el('label', { for: 'audio-draft-artist' }, 'Artista'); artistLabel.append(artist);
  const bpmLabel = el('label', { for: 'audio-draft-bpm' }, 'BPM (puedes corregir la sugerencia)'); bpmLabel.append(bpm);
  form.append(fileLabel, titleLabel, artistLabel, bpmLabel);
  const actions = el('footer', { className: 'audio-draft-actions' }); actions.append(analyze, saveLab, create);
  livePanel.append(el('h3', {}, 'Karaoke de análisis en vivo'),
    el('p', { className: 'audio-live-note' }, 'Inicia el micrófono y reproduce la pista para comparar la entrada con el tramo actual. Usa auriculares para que la pista no se filtre al micrófono. Se analiza localmente; el porcentaje compara perfiles de croma y no es una nota de ejecución. Si cantas una sola nota, puede faltar información para confirmar el acorde completo.'),
    liveToolControls, referenceToggle, liveStatus, liveMetrics, liveCompatibility, liveVisuals, liveActions);
  for (const [id, target] of liveToolNodes) target.hidden = !liveToolState[id];
  const labHeader = el('header', { className: 'lab-header' });
  const modes = el('nav', { className: 'lab-mode-nav', 'aria-label': 'Vistas del proyecto' });
  const autopsyMode = el('button', { type: 'button', className: 'lab-workspace-tab is-active', 'aria-pressed': 'true' }, 'Autopsia del audio');
  const karaokeMode = el('button', { type: 'button', className: 'lab-workspace-tab', 'aria-pressed': 'false' }, 'Karaoke y escucha en vivo');
  const stemsMode = el('button', { type: 'button', className: 'lab-workspace-tab', 'aria-pressed': 'false' }, 'Autopsia multipista');
  const looperMode = el('button', { type: 'button', className: 'lab-workspace-tab', 'aria-pressed': 'false' }, 'Loopera');
  modes.append(autopsyMode, karaokeMode, stemsMode, looperMode, editMode, stageMode);
  const headerBrand = el('div', { className: 'lab-header-brand' }); headerBrand.append(heading);
  const headerHelp = el('button', { type: 'button', className: 'analysis-help-tip lab-header-help' }, '?');
  headerHelp.dataset.tip = 'Selecciona un tramo del mapa para escuchar y estudiar cómo cambia la armonía. El acorde aproximado se puede corregir; las posiciones muestran notas posibles para tocar.';
  headerHelp.setAttribute('aria-label', headerHelp.dataset.tip);
  headerBrand.append(headerHelp);
  const sidebarToggle = el('button', { type: 'button', className: 'lab-sidebar-toggle', 'aria-pressed': 'true' }, 'Fuente y proyecto');
  labHeader.append(headerBrand, modes, headerHelp, sidebarToggle, closeButton);
  const transport = el('section', { className: 'lab-transport', 'aria-label': 'Reproducción de la pista' });
  transport.append(mediaPreview, transportStatus);
  const sidebar = el('aside', { className: 'lab-sidebar' });
  sidebar.append(el('h2', {}, 'Fuente y proyecto'), form, status, preview, actions, sectionPanel);
  const workspace = el('div', { className: 'lab-workspace', 'data-workspace': 'autopsy' }); workspace.append(sidebar, analysisPanel, livePanel);
  dialog.dataset.workspace = 'autopsy';
  dialog.append(labHeader, transport, workspace);
  document.body.append(dialog);

  const sidebarPreferenceKey = 'stageprompter:source-panel:v1';
  try {
    const isOpen = localStorage.getItem(sidebarPreferenceKey) !== 'false';
    sidebar.hidden = !isOpen; sidebarToggle.setAttribute('aria-pressed', String(isOpen));
    sidebarToggle.textContent = isOpen ? 'Ocultar fuente' : 'Mostrar fuente';
  } catch { /* storage may be disabled */ }
  workspace.dataset.sourcePanel = sidebar.hidden ? 'hidden' : 'visible';
  sidebarToggle.addEventListener('click', () => {
    sidebar.hidden = !sidebar.hidden;
    workspace.dataset.sourcePanel = sidebar.hidden ? 'hidden' : 'visible';
    sidebarToggle.setAttribute('aria-pressed', String(!sidebar.hidden));
    sidebarToggle.textContent = sidebar.hidden ? 'Mostrar fuente' : 'Ocultar fuente';
    try { localStorage.setItem(sidebarPreferenceKey, String(!sidebar.hidden)); } catch { /* storage may be disabled */ }
  });

  function setWorkspaceMode(nextMode) {
    const validModes = new Set(['autopsy', 'karaoke', 'stems', 'looper']);
    if (!validModes.has(nextMode)) nextMode = 'autopsy';
    workspace.dataset.workspace = nextMode;
    dialog.dataset.workspace = nextMode;
    analysisPanel.hidden = nextMode !== 'autopsy';
    livePanel.hidden = nextMode !== 'karaoke';
    multitrackView.audioPanel.hidden = nextMode !== 'stems';
    multitrackView.looperPanel.hidden = nextMode !== 'looper';
    for (const [button, mode] of [[autopsyMode, 'autopsy'], [karaokeMode, 'karaoke'], [stemsMode, 'stems'], [looperMode, 'looper']]) {
      const active = mode === nextMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    try { localStorage.setItem('stageprompter:workspace:v1', nextMode); } catch { /* storage may be disabled */ }
    if (nextMode === 'stems' || nextMode === 'looper') multitrackView.refresh();
    requestAnimationFrame(() => liveView?.redraw());
  }
  autopsyMode.addEventListener('click', () => setWorkspaceMode('autopsy'));
  karaokeMode.addEventListener('click', () => setWorkspaceMode('karaoke'));
  stemsMode.addEventListener('click', () => setWorkspaceMode('stems'));
  looperMode.addEventListener('click', () => setWorkspaceMode('looper'));

  async function ensureMultitrackAudioAsset(blob, name, durationMs) {
    if (blob === selectedFile) {
      if (!projectAudioAssetId) projectAudioAssetId = createAssetId();
      const existing = await getAsset(projectAudioAssetId);
      if (!existing?.blob) await saveAsset({ id: projectAudioAssetId, blob, name, mime: blob.type || 'application/octet-stream', bytes: blob.size || 0, duration: durationMs / 1000 });
      pendingAsset = null;
      return projectAudioAssetId;
    }
    const id = createAssetId();
    await saveAsset({ id, blob, name, mime: blob.type || 'application/octet-stream', bytes: blob.size || 0, duration: durationMs / 1000 });
    return id;
  }
  multitrackView = createMultitrackWorkspace({
    initialStems: multitrackState.stems, initialLoop: multitrackState.loop,
    getSourceFile: () => selectedFile, getSourceAssetId: () => projectAudioAssetId,
    getAnalysis: () => analysis, getSelectedRange: () => liveView?.getSelectedSegment?.(),
    getBpm: () => Number(bpm.value) || analysis?.bpm || 120,
    ensureAudioAsset: ensureMultitrackAudioAsset,
    onProjectChange: (state) => { multitrackState = state; saveLab.disabled = false; scheduleProjectSave(); },
    onOpenLooper: () => setWorkspaceMode('looper'),
  });
  workspace.append(multitrackView.audioPanel, multitrackView.looperPanel);
  multitrackView.audioPanel.hidden = true; multitrackView.looperPanel.hidden = true;
  try {
    const savedMode = localStorage.getItem('stageprompter:workspace:v1');
    if (['karaoke', 'autopsy', 'stems', 'looper'].includes(savedMode)) setWorkspaceMode(savedMode);
  } catch { /* storage may be disabled */ }

  function projectSnapshot() {
    const multitrack = multitrackView?.getState() || multitrackState;
    return { id: projectId, schemaVersion: 1, title: title.value.trim(), artist: artist.value.trim(),
      bpm: Number(bpm.value) || analysis?.bpm || multitrack.loop?.bpm || 120, updatedAt: new Date().toISOString(),
      audioAssetId: projectAudioAssetId, fileName: selectedFile?.name || '',
      songId: linkedSongId, selectedSectionId, analysis: analysis ? structuredClone(analysis) : null,
      sections: structuredClone(labSections), stems: structuredClone(multitrack.stems || []), loop: structuredClone(multitrack.loop || {}) };
  }
  function persistProject() {
    if (!analysis && !selectedFile && !multitrackState.stems?.length && !multitrackState.loop?.tracks?.length) return Promise.resolve();
    if (!projectId) projectId = `lab-${crypto.randomUUID?.() || Date.now()}`;
    if (selectedFile && !projectAudioAssetId) {
      projectAudioAssetId = createAssetId();
      pendingAsset = { id: projectAudioAssetId, blob: selectedFile, name: selectedFile.name,
        mime: selectedFile.type || 'application/octet-stream', bytes: selectedFile.size,
        duration: (analysis?.durationMs || 0) / 1000 };
    }
    const snapshot = projectSnapshot();
    const assetToSave = pendingAsset;
    pendingAsset = null;
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      if (assetToSave) await saveLabProjectWithAsset(snapshot, assetToSave);
      else await saveLabProject(snapshot);
    });
    return saveQueue.then(() => { status.textContent = 'Laboratorio guardado en este dispositivo.'; }, (error) => {
      if (assetToSave) pendingAsset = assetToSave;
      status.textContent = `No se pudo guardar el laboratorio: ${error?.message || error}`;
      throw error;
    });
  }
  function scheduleProjectSave() {
    if (!analysis && !selectedFile && !multitrackState.stems?.length && !multitrackState.loop?.tracks?.length) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persistProject().catch(() => {}); }, 500);
  }
  async function cleanUp() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (analysis || selectedFile || multitrackState.stems?.length || multitrackState.loop?.tracks?.length) {
      try { await persistProject(); } catch { return false; }
    }
    if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
    liveView?.dispose();
    await multitrackView?.dispose();
    liveCapture?.dispose(); liveCapture = null;
    if (keyboardHandler) document.removeEventListener('keydown', keyboardHandler);
    mediaPlayer?.pause(); mediaPlayer = null;
    try { mediaAudioSource?.disconnect(); mediaEqNodes?.forEach((filter) => filter.disconnect()); } catch { /* audio graph already detached */ }
    if (mediaAudioContext && mediaAudioContext.state !== 'closed') await mediaAudioContext.close().catch(() => {});
    mediaAudioContext = null; mediaAudioSource = null; mediaEqNodes = null; mediaEqPlayer = null;
    worker?.terminate(); worker = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    dialog.remove(); document.getElementById('app').style.display = ''; onClose();
    return true;
  }
  function fail(error) {
    worker?.terminate(); worker = null;
    decoded = null;
    status.textContent = error?.message || 'No se pudo completar el análisis.';
    busy = false; analyze.disabled = false; create.disabled = !analysis;
  }
  function playbackPositionMs() { return Math.max(0, (mediaPlayer?.currentTime || 0) * 1000); }
  function playRange(startMs, endMs, label) {
    if (!mediaPlayer) {
      transportStatus.textContent = 'Este proyecto no tiene audio local. Carga la pista para escucharlo.';
      liveView?.setAuditionStatus(transportStatus.textContent);
      return;
    }
    const token = ++auditionToken;
    auditionEndMs = endMs;
    auditionArmed = false;
    transportStatus.textContent = `Cargando ${label}…`;
    liveView?.setAuditionStatus(transportStatus.textContent);
    try { mediaPlayer.currentTime = startMs / 1000; }
    catch {
      mediaPlayer.addEventListener('loadedmetadata', () => {
        if (token === auditionToken) mediaPlayer.currentTime = startMs / 1000;
      }, { once: true });
    }
    const playback = mediaPlayer.play();
    Promise.resolve(playback).then(() => {
      if (token !== auditionToken) return;
      auditionArmed = true;
      transportStatus.textContent = `Sonando ${label} · ${Math.round(startMs / 1000)}–${Math.round(endMs / 1000)} s`;
      liveView?.setAuditionStatus(transportStatus.textContent);
    }, (error) => {
      if (token !== auditionToken) return;
      auditionEndMs = null;
      auditionArmed = false;
      transportStatus.textContent = `No se pudo reproducir: ${error?.message || 'revisa el archivo de audio'}.`;
      liveView?.setAuditionStatus(transportStatus.textContent);
    });
    livePlayerEvents();
  }
  function playAnalysisSegment(segment) {
    if (!analysis || !segment) return;
    let segments = analysis.harmonicRegions?.length ? analysis.harmonicRegions : analysis.chordCandidates;
    let index = segments.indexOf(segment);
    if (index < 0) { segments = analysis.chordCandidates; index = segments.indexOf(segment); }
    const range = getAuditionRange(segments, index);
    if (!range) return;
    selectedSectionId = sectionAt(labSections, range.startMs)?.id || null;
    renderSections();
    playRange(range.startMs, range.endMs, `tramo ${index + 1}${range.symbol ? ` · ${range.symbol}` : ''}`);
  }
  function currentSegment() {
    return segmentAt(playbackPositionMs());
  }
  function segmentAt(position) {
    const segments = analysis?.harmonicRegions?.length ? analysis.harmonicRegions : analysis?.chordCandidates || [];
    return segments.find((segment) => position >= segment.startMs && position < segment.endMs)
      || segments.at(-1) || null;
  }
  function renderSections() {
    sectionList.replaceChildren(); sectionEditor.replaceChildren();
    if (!labSections.length) {
      sectionEditor.append(el('p', { className: 'lab-help' }, 'Analiza una pista para comenzar a escribir.'));
      return;
    }
    const format = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    for (const section of labSections) {
      const button = el('button', { type: 'button', className: 'lab-section-button' },
        `${section.label} · ${format(section.startMs)}–${format(section.endMs)}`);
      button.setAttribute('aria-current', section.id === selectedSectionId ? 'true' : 'false');
      button.addEventListener('click', () => {
        selectedSectionId = section.id; renderSections();
        liveView?.selectSegmentAt(section.startMs);
        playRange(section.startMs, section.endMs, `sección ${section.label}`);
      });
      sectionList.append(button);
    }
    const section = labSections.find((item) => item.id === selectedSectionId) || labSections[0];
    selectedSectionId = section.id;
    const split = el('button', { type: 'button', className: 'btn-secondary' }, 'Dividir aquí');
    split.addEventListener('click', () => {
      const at = Math.round(liveView?.getSelectedSegment()?.startMs ?? playbackPositionMs());
      if (!splitLabSection(labSections, at)) {
        status.textContent = 'El cursor debe estar dentro de una sección, al menos medio segundo después del inicio y antes del final.';
        return;
      }
      selectedSectionId = sectionAt(labSections, at)?.id || null;
      renderSections(); scheduleProjectSave(); liveView?.refreshDetail();
    });
    const name = el('input', { type: 'text', maxlength: 80, value: section.label, 'aria-label': 'Nombre de sección' });
    name.addEventListener('input', () => { section.label = name.value; scheduleProjectSave(); });
    name.addEventListener('change', renderSections);
    const type = el('select', { 'aria-label': 'Tipo de sección' });
    [['instrumental', 'Instrumental'], ['intro', 'Introducción'], ['verse', 'Verso'], ['prechorus', 'Preestribillo'],
      ['chorus', 'Estribillo'], ['bridge', 'Puente'], ['solo', 'Solo'], ['outro', 'Final'], ['other', 'Otra']]
      .forEach(([value, label]) => type.add(new Option(label, value)));
    type.value = section.type;
    type.addEventListener('change', () => { section.type = type.value; scheduleProjectSave(); });
    const lyric = el('textarea', { rows: 5, maxlength: 2000, placeholder: 'Escribe la letra de esta sección…', 'aria-label': 'Letra de la sección' });
    lyric.value = section.lyric || '';
    lyric.addEventListener('input', () => { section.lyric = lyric.value; scheduleProjectSave(); });
    const tab = el('textarea', { rows: 5, maxlength: 20000, placeholder: 'Tablatura ASCII escrita por ti…', 'aria-label': 'Tablatura de la sección' });
    tab.value = section.tab || '';
    tab.addEventListener('input', () => { section.tab = tab.value; scheduleProjectSave(); });
    tab.addEventListener('change', () => liveView?.refreshDetail());
    const field = (label, control) => { const wrapper = el('label', { className: 'lab-field' }, label); wrapper.append(control); return wrapper; };
    sectionEditor.append(el('div', { className: 'lab-section-editor-head' }, ''),
      field('Nombre', name), field('Tipo', type), field('Letra', lyric), field('Tablatura', tab));
    sectionEditor.firstChild.append(el('strong', {}, 'Editar sección'), split);
  }
  renderSections();
  function updateLiveNote(frame) {
    const result = livePitchTracker.update(frame?.pitchHz, frame?.pitchConfidence, frame?.observedPerfMs || performance.now());
    currentLiveNote = result.current;
    if (!currentLiveNote) {
      const candidate = Number.isFinite(result.candidate)
        ? `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((result.candidate % 12) + 12) % 12]}${Math.floor(result.candidate / 12) - 1}` : '';
      liveNoteName.textContent = candidate ? `… ${candidate}` : '—';
      liveNoteInfo.textContent = candidate ? `Confirmando nota · ${Math.min(280, result.pendingMs)}/280 ms` : 'Esperando una fundamental clara';
      tunerNeedle.style.left = '50%';
      liveKeyboard.querySelectorAll('.is-current').forEach((key) => key.classList.remove('is-current'));
      return;
    }
    const frequency = currentLiveNote.frequencyHz;
    const midi = currentLiveNote.midi;
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pitchClass = ((midi % 12) + 12) % 12;
    const note = `${names[pitchClass]}${Math.floor(midi / 12) - 1}`;
    currentLiveNote = { ...currentLiveNote, label: note };
    const referenceHz = 440 * 2 ** ((midi - 69) / 12);
    const cents = frequency > 0 ? 1200 * Math.log2(frequency / referenceHz) : 0;
    liveNoteName.textContent = note;
    tunerNeedle.style.left = `${Math.max(0, Math.min(100, cents + 50))}%`;
    tunerMeter.setAttribute('aria-label', `${note}, ${cents >= 0 ? '+' : ''}${Math.round(cents)} cents respecto a la afinación temperada`);
    liveKeyboard.querySelectorAll('[data-pc]').forEach((key) => key.classList.toggle('is-current', Number(key.dataset.pc) === pitchClass));
    liveNoteInfo.textContent = `${Math.round(frequency || 0)} Hz · ${cents > 3 ? 'alta' : cents < -3 ? 'baja' : 'afinada'} · ${cents >= 0 ? '+' : ''}${Math.round(cents)} cents · YIN ${Math.round(currentLiveNote.confidence * 100)}%`;
  }
  function getLiveChordFingerprint(chroma = liveChordResult?.chroma || []) {
    const maximum = Math.max(0, ...chroma);
    const pitchClass = Number.isInteger(liveChordResult?.evidence?.fundamentalPitchClass)
      ? liveChordResult.evidence.fundamentalPitchClass : null;
    const supports = (estimate) => {
      if (!estimate?.symbol) return false;
      const data = getChordTones(estimate.symbol);
      if (!data.recognized || maximum <= 0.04) return false;
      const supportedTones = data.tones.filter((tone) => chroma[tone] >= maximum * 0.2).length;
      // A monophonic YIN estimate can mistake a chord tone for the fundamental.
      // Three distinct chord pitch classes are sufficient evidence even when
      // their played octaves overlap that estimated note's harmonic series.
      const hasIndependentPeak = (liveChordResult?.evidence?.independentPeakCount || 0) > 0;
      const requiredChordTones = Math.min(3, data.tones.length);
      return supportedTones >= 2 && (pitchClass === null || hasIndependentPeak || supportedTones >= requiredChordTones);
    };
    const confirmed = liveChordResult?.confirmed;
    const proposal = liveChordResult?.proposal;
    const suggested = supports(proposal) ? proposal : supports(confirmed) ? confirmed : null;
    const data = suggested ? getChordTones(suggested.symbol) : null;
    const changing = Boolean(proposal && confirmed && proposal.symbol !== confirmed.symbol && supports(proposal));
    const state = suggested
      ? changing ? `cambio candidato · ${Math.min(340, liveChordResult.pendingMs)}/340 ms`
        : suggested === confirmed || suggested.symbol === confirmed?.symbol ? 'estable confirmado' : 'propuesta del micrófono'
      : (proposal || confirmed) ? 'sin evidencia suficiente · no confirmado' : 'esperando armonía';
    return { suggested, data, state };
  }
  function drawLiveSpectrum(frame, detectedMidi) {
    const rect = liveSpectrumCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(250, Math.floor(rect.width)); const height = 120;
    liveSpectrumCanvas.width = Math.floor(width * ratio); liveSpectrumCanvas.height = Math.floor(height * ratio);
    const ctx = liveSpectrumCanvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#08110d'; ctx.fillRect(0, 0, width, height);
    const left = 31, right = width - 8, top = 10, bottom = height - 22;
    const minHz = 32.7, maxHz = 5000;
    const xFor = (frequency) => left + Math.log(Math.max(minHz, Math.min(maxHz, frequency)) / minHz) / Math.log(maxHz / minHz) * (right - left);
    ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'center';
    for (const frequency of [32.7, 55, 110, 220, 440, 880, 1760, 3520]) {
      const x = xFor(frequency); ctx.strokeStyle = 'rgba(196,216,198,.16)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.fillStyle = '#a9b9ac'; ctx.fillText(frequency >= 1000 ? `${(frequency / 1000).toFixed(frequency % 1000 ? 1 : 0)}k` : String(frequency), x, height - 8);
    }
    for (const level of [.25, .5, .75, 1]) {
      const y = bottom - level * (bottom - top); ctx.strokeStyle = 'rgba(196,216,198,.11)'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    const bins = frame?.spectrumBins || [];
    const getBinY = (frequency) => {
      const index = Math.max(0, Math.min(bins.length - 1,
        Math.round(Math.log(frequency / minHz) / Math.log(maxHz / minHz) * (bins.length - 1))));
      return bottom - (bins[index] || 0) * (bottom - top);
    };
    if (bins.length) {
      ctx.beginPath();
      bins.forEach((magnitude, index) => {
        const frequency = minHz * (maxHz / minHz) ** (index / (bins.length - 1));
        const x = xFor(frequency); const y = bottom - Math.max(0, Math.min(1, magnitude)) * (bottom - top);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath();
      ctx.fillStyle = 'rgba(87,215,189,.13)'; ctx.fill();
      ctx.beginPath();
      bins.forEach((magnitude, index) => {
        const frequency = minHz * (maxHz / minHz) ** (index / (bins.length - 1));
        const x = xFor(frequency); const y = bottom - Math.max(0, Math.min(1, magnitude)) * (bottom - top);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#58d7bd'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.fillStyle = '#aab8ac'; ctx.textAlign = 'center'; ctx.fillText('Esperando datos del espectro', (left + right) / 2, (top + bottom) / 2);
    }
    const chordFingerprint = getLiveChordFingerprint(liveChordResult?.chroma || frame?.chroma || []);
    const chordSymbol = chordFingerprint.suggested?.symbol || '';
    const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    liveSpectrumChordName.textContent = chordSymbol || 'Sin acorde claro';
    liveSpectrumChordTones.textContent = chordFingerprint.data?.recognized
      ? `${chordFingerprint.data.tones.map((pitch) => pitchNames[pitch]).join(' · ')} · cualquier octava · ${chordFingerprint.state}`
      : chordFingerprint.state;
    const nearestNoteMidi = Number.isFinite(detectedMidi) ? detectedMidi : null;
    const currentPitchHz = Number.isFinite(currentLiveNote?.frequencyHz) ? currentLiveNote.frequencyHz
      : Number.isFinite(nearestNoteMidi) ? 440 * 2 ** ((nearestNoteMidi - 69) / 12) : 0;
    const actualPeaks = frame?.spectralPeaks || [];
    const closestPeak = currentPitchHz > 0 ? actualPeaks.reduce((best, peak) => {
      if (!(peak.frequencyHz > 0)) return best;
      const cents = Math.abs(1200 * Math.log2(peak.frequencyHz / currentPitchHz));
      return !best || cents < best.cents ? { peak, cents } : best;
    }, null) : null;
    const suggestedNote = Number.isFinite(nearestNoteMidi)
      ? `${pitchNames[((nearestNoteMidi % 12) + 12) % 12]}${Math.floor(nearestNoteMidi / 12) - 1}` : '';
    liveSpectrumNoteName.textContent = suggestedNote || 'Sin nota clara';
    liveSpectrumNoteInfo.textContent = suggestedNote
      ? `${closestPeak && closestPeak.cents <= 100
        ? `pico cercano ${closestPeak.peak.note} · ${Math.round(closestPeak.peak.frequencyHz)} Hz`
        : 'estimación de fundamental YIN'}${currentLiveNote ? ` · confianza ${Math.round((currentLiveNote.confidence || 0) * 100)}%` : ' · confirmando'}`
      : 'Esperando una fundamental clara';
    liveSpectrumCanvas.setAttribute('aria-label',
      `Espectro del micrófono. Acorde sugerido: ${chordSymbol || 'sin acorde claro'}. Nota más cercana: ${suggestedNote || 'sin nota clara'}. La huella amarilla marca la nota estimada y las guías azules repiten sus tonos en todas las octavas audibles, desde 32.7 Hz hasta 5 kHz.`);

    // Draw every occurrence of each chord pitch class across the audible
    // registers. These are guides only; the curve and dots remain measured.
    if (chordFingerprint.data?.recognized) {
      const chordMarkers = expandPitchClassesAcrossOctaves(chordFingerprint.data.tones, minHz, maxHz);
      const toneRows = new Map(chordFingerprint.data.tones.map((pitchClass, index) => [pitchClass, index]));
      chordMarkers.forEach((tone) => {
        const x = xFor(tone.frequencyHz); const y = getBinY(tone.frequencyHz);
        const strength = bins.length ? bins[Math.max(0, Math.min(bins.length - 1,
          Math.round(Math.log(tone.frequencyHz / minHz) / Math.log(maxHz / minHz) * (bins.length - 1))))] || 0 : 0;
        ctx.save(); ctx.setLineDash([2, 3]);
        ctx.strokeStyle = `rgba(111,177,255,${strength >= 0.2 ? 0.84 : 0.34})`;
        ctx.lineWidth = strength >= 0.2 ? 1.4 : 0.8;
        ctx.beginPath(); ctx.moveTo(x, top + 5); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
        ctx.fillStyle = `rgba(143,199,255,${strength >= 0.2 ? 0.95 : 0.58})`;
        ctx.beginPath(); ctx.arc(x, y, strength >= 0.2 ? 2.8 : 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = strength >= 0.2 ? '#c9e5ff' : 'rgba(184,220,255,.78)';
        ctx.font = `${strength >= 0.2 ? '700' : '500'} 7px system-ui,sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(tone.label, x, top + 8 + toneRows.get(tone.pitchClass) * 8);
      });
    }
    // The note fingerprint is its expected harmonic series (f0, 2f0, 3f0…);
    // compare each guide with the actual spectral peak below it.
    if (currentPitchHz >= minHz && currentPitchHz <= maxHz) {
      for (let harmonic = 1; harmonic <= 8; harmonic++) {
        const frequency = currentPitchHz * harmonic;
        if (frequency < minHz || frequency > maxHz) continue;
        const x = xFor(frequency); const y = getBinY(frequency);
        ctx.save(); ctx.setLineDash(harmonic === 1 ? [] : [2, 3]);
        ctx.strokeStyle = harmonic === 1 ? 'rgba(239,244,124,.95)' : 'rgba(239,244,124,.47)';
        ctx.lineWidth = harmonic === 1 ? 1.8 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
        ctx.fillStyle = '#f2f58f'; ctx.font = '700 7px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`H${harmonic}`, x, bottom - 3);
      }
    }
    const peaks = (frame?.spectralPeaks || []).filter((peak) => Number.isFinite(peak.frequencyHz) && peak.frequencyHz >= minHz && peak.frequencyHz <= maxHz)
      .sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, 6);
    peaks.forEach((peak, index) => {
      const x = xFor(peak.frequencyHz); const y = bottom - (bins[Math.max(0, Math.min(bins.length - 1, Math.round(Math.log(peak.frequencyHz / minHz) / Math.log(maxHz / minHz) * (bins.length - 1))))] || 0) * (bottom - top);
      const isFundamental = Number.isFinite(detectedMidi) && peak.midi === detectedMidi;
      ctx.fillStyle = isFundamental ? '#eff47c' : '#f0a957'; ctx.beginPath(); ctx.arc(x, y, isFundamental ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isFundamental ? '#f1f5ae' : '#e2b870'; ctx.font = '700 8px system-ui,sans-serif';
      ctx.fillText(peak.note || '', x, Math.max(top + 8, y - 5 - (index % 2) * 8));
    });
  }
  function updateLiveReference() {
    const segment = currentSegment();
    const referenceSymbol = segment?.selectedSymbol || segment?.symbol;
    const frame = liveScores.at(-1)?.frame;
    const confirmed = liveChordResult?.confirmed;
    const proposal = liveChordResult?.proposal;
    const chroma = liveChordResult?.chroma || frame?.chroma || [];
    const chordFingerprint = getLiveChordFingerprint(chroma);
    const micSymbol = chordFingerprint.suggested?.symbol || '';
    const chordSupported = Boolean(chordFingerprint.suggested);
    const radarSymbol = chordSupported ? micSymbol : '';
    const detectedNote = currentLiveNote?.label || '';
    if (frame || currentLiveNote) {
      liveRadar.update(chroma, radarSymbol, chordSupported ? chordFingerprint.state
        : detectedNote ? 'Nota detectada · acorde sin confirmar' : chordFingerprint.state, detectedNote);
    }
    if (frame || currentLiveNote) drawLiveSpectrum(frame, currentLiveNote?.midi ?? null);
    if (!chordSupported && (confirmed || proposal)) {
      liveGuess.textContent = detectedNote
        ? `Nota del micrófono: ${detectedNote} · sin evidencia suficiente para confirmar ${micSymbol}`
        : `Acorde ${micSymbol} descartado · esperando notas compatibles del micrófono`;
    }
    if (!referenceCheckbox.checked) {
      liveReference.textContent = 'Referencia de pista desactivada';
      liveTransition.textContent = 'Escucha independiente del micrófono';
      liveSimilarity.textContent = 'Afinidad armónica: sin cotejo con pista';
      liveCompatibility.textContent = 'Cotejo desactivado';
      return;
    }
    if (!segment) {
      liveReference.textContent = analysis ? 'Sin tramo de referencia en esta posición' : 'Sin audio cargado · escucha independiente';
      liveTransition.textContent = 'Secuencia de referencia: —';
      liveSimilarity.textContent = 'Afinidad armónica: esperando una pista';
      liveCompatibility.textContent = 'Carga un audio para comparar el micrófono con sus acordes.';
      return;
    }
    liveReference.textContent = segment.selectedSymbol
      ? `Referencia elegida: ${segment.selectedSymbol}`
      : `Referencia automática (sin confirmar): ${segment.symbol || 'sin acorde claro'}`;
    const segments = analysis.harmonicRegions?.length ? analysis.harmonicRegions : analysis.chordCandidates;
    const currentIndex = segments.indexOf(segment);
    const previous = currentIndex > 0 ? segments[currentIndex - 1] : null;
    const previousSymbol = previous?.selectedSymbol || previous?.symbol;
    liveTransition.textContent = previousSymbol && referenceSymbol
      ? `Secuencia de referencia: ${previousSymbol} → ${referenceSymbol}${previous?.selectedSymbol && segment.selectedSymbol ? ' · elegida' : ' · propuesta'}`
      : 'Secuencia: sin acorde anterior para comparar';
    if (liveScores.length && liveScores.at(-1).frame) {
      if (confirmed && confirmed.symbol === micSymbol && chordSupported) {
        const matches = confirmed.symbol === referenceSymbol;
        const pending = proposal && proposal.symbol !== confirmed.symbol
          ? ` · verificando ${proposal.symbol} (${Math.min(340, liveChordResult.pendingMs)}/340 ms)` : '';
        liveGuess.textContent = `Acorde estable: ${confirmed.symbol} · ajuste ${confirmed.score.toFixed(2)}${matches ? ' · coincide con el tramo' : ''}${pending}`;
      } else if (proposal && proposal.symbol === micSymbol && chordSupported) {
        liveGuess.textContent = `Evaluando ${proposal.symbol} · ${Math.min(340, liveChordResult.pendingMs)}/340 ms antes de confirmar`;
      } else if (!confirmed && !proposal) liveGuess.textContent = detectedNote
        ? `Nota del micrófono: ${detectedNote} · esperando otras notas para formar un acorde`
        : 'Escucha estimada: armonía ambigua; esperando una propuesta clara';
      if (referenceSymbol && segment.chroma) {
        const recentScores = liveScores.filter((item) => Date.now() - item.at < 2500 && item.affinity !== null)
          .map((item) => item.affinity);
        const mean = recentScores.length ? recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length : null;
        const middle = Math.floor(recentScores.length / 2);
        const firstHalf = recentScores.slice(0, middle); const secondHalf = recentScores.slice(middle);
        const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        const delta = average(secondHalf) - average(firstHalf);
        const trend = Number.isFinite(delta) && recentScores.length >= 4
          ? delta > 0.025 ? ` · mejorando ↑ ${Math.round(delta * 100)} pp` : delta < -0.025 ? ` · alejándose ↓ ${Math.round(Math.abs(delta) * 100)} pp` : ' · estable'
          : '';
        liveSimilarity.textContent = mean === null ? 'Afinidad armónica: esperando señal' : `Afinidad armónica: ${Math.round(mean * 100)}%${trend}`;
      }
      if (segment.selectedSymbol) {
        const fit = scoreChordChroma(frame.chroma, segment.selectedSymbol);
        liveCompatibility.textContent = fit.status === 'scored'
          ? `Energía captada dentro de ${segment.selectedSymbol}: ${Math.round(fit.ratio * 100)}% (orientativo).`
          : 'Compatibilidad con el acorde elegido: señal insuficiente.';
      } else liveCompatibility.textContent = 'Elige un acorde para ver compatibilidad con su conjunto de notas.';
    }
  }
  referenceCheckbox.addEventListener('change', () => {
    try { localStorage.setItem(referencePreferenceKey, String(referenceCheckbox.checked)); } catch { /* storage may be disabled */ }
    updateLiveReference();
  });
  function updatePlayhead() {
    if (!mediaPlayer || !analysis) return;
    if (auditionEndMs !== null && auditionArmed && !mediaPlayer.seeking && !mediaPlayer.paused && playbackPositionMs() >= auditionEndMs) {
      const endMs = auditionEndMs;
      auditionEndMs = null;
      auditionArmed = false;
      mediaPlayer.pause();
      mediaPlayer.currentTime = endMs / 1000;
      liveView?.setPlaybackPosition(Math.max(0, endMs - 1), { followSelection: false });
      transportStatus.textContent = 'Fin del pasaje. Selecciona otro tramo o pulsa escuchar para repetir.';
      liveView?.setAuditionStatus(transportStatus.textContent);
      playheadFrame = null;
      return;
    }
    const now = performance.now();
    if (now - lastPlayheadDrawAt >= 75) {
      lastPlayheadDrawAt = now;
      liveView?.setPlaybackPosition(playbackPositionMs());
    }
    const segment = currentSegment();
    if (segment && segment.startMs !== lastLiveSegmentStartMs) {
      lastLiveSegmentStartMs = segment.startMs;
      liveScores = [];
      updateLiveReference();
    }
    if (!mediaPlayer.paused && !mediaPlayer.ended) playheadFrame = requestAnimationFrame(updatePlayhead);
    else playheadFrame = null;
  }
  file.addEventListener('change', () => {
    if (analysis) persistProject().catch(() => {});
    liveCapture?.dispose(); liveCapture = null;
    micSwitch.checked = false; micSwitch.setAttribute('aria-checked', 'false'); micSwitchState.textContent = 'Apagado';
    try { localStorage.setItem(micPreferenceKey, 'false'); } catch { /* storage may be disabled */ }
    setWorkspaceMode('autopsy'); liveView?.dispose(); liveView = null; liveScores = []; lastLiveSegmentStartMs = null;
    auditionEndMs = null; auditionArmed = false; auditionToken++; projectId = null; projectAudioAssetId = null; pendingAsset = null; linkedSongId = null;
    editMode.disabled = true; stageMode.disabled = true;
    labSections = []; selectedSectionId = null; renderSections();
    mediaPlayer?.pause(); mediaPlayer = null; playheadMediaPlayer = null;
    transport.querySelector('.analysis-waveform')?.remove();
    transport.querySelector('.harmonic-history-host')?.remove();
    selectedFile = file.files?.[0] || null; decoded = null; waveform = []; analysis = null; create.disabled = true;
    multitrackView.restoreState({ stems: [], loop: { bpm: Number(bpm.value) || 120, loopStartMs: 0, loopEndMs: 0, loopEnabled: true, positionMs: 0, tracks: [] } });
    analysisPanel.replaceChildren(el('div', { className: 'lab-empty-map' }, 'Carga una pista y pulsa «Analizar archivo» para construir el mapa del sonido.'));
    mediaPreview.replaceChildren(); mediaPlayer = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    if (!selectedFile) { saveLab.disabled = true; multitrackView.setSource(); return; }
    mediaUrl = URL.createObjectURL(selectedFile);
    mediaPlayer = document.createElement(selectedFile.type.startsWith('video/') ? 'video' : 'audio');
    mediaPlayer.controls = true; mediaPlayer.preload = 'metadata'; mediaPlayer.src = mediaUrl;
    mediaPreview.append(mediaPlayer);
    transportStatus.textContent = `Pista lista: ${selectedFile.name}`;
    title.value = selectedFile.name.replace(/\.[^.]+$/, '').slice(0, 200);
    preview.textContent = `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MiB`;
    status.textContent = 'Archivo elegido. Pulsa Analizar archivo para decodificarlo localmente.';
    saveLab.disabled = false;
    multitrackView.setSource();
    scheduleProjectSave();
  });
  function refreshAnalysisSummary() {
    if (!analysis) return;
    const segments = analysis.harmonicRegions?.length ? analysis.harmonicRegions : analysis.chordCandidates;
    analysis.chordSuggestions = segments.filter((segment) => !segment.isSilence && segment.selectedSymbol)
      .map((segment) => ({ symbol: segment.selectedSymbol, startMs: segment.startMs, endMs: segment.endMs }));
    const unassigned = segments.filter((segment) => !segment.isSilence && !segment.selectedSymbol).length;
    preview.textContent = `${selectedFile?.name || 'Pista no vinculada'}\nDuración: ${(analysis.durationMs / 1000).toFixed(1)} s\nBPM sugerido: ${Number.isFinite(analysis.bpm) ? analysis.bpm.toFixed(1) : 'no disponible'}\nPulsos detectados: ${analysis.beats?.length || 0}\nTramos armónicos: ${segments.length} · fotos por pulso: ${analysis.chordCandidates.length}\nAcordes elegidos: ${analysis.chordSuggestions.length} · sin asignar: ${unassigned}`;
  }
  function showAnalysis(data, { restored = false } = {}) {
    const needsHarmonicMigration = data.harmonicSegmentationVersion !== 5 && data.chordCandidates?.length;
    if (needsHarmonicMigration) {
      const previousRegions = data.harmonicRegions || [];
      const pulseFrames = data.chordCandidates.map((segment) => {
        const timeMs = (segment.startMs + segment.endMs) / 2;
        const spectralFrame = (data.spectralFrames || []).reduce((closest, frame) =>
          !closest || Math.abs(frame.timeMs - timeMs) < Math.abs(closest.timeMs - timeMs) ? frame : closest, null);
        return {
          timeSec: timeMs / 1000,
          chroma: segment.chroma || Array(12).fill(0),
          spectralPeaks: segment.spectralPeaks || [],
          rms: Number.isFinite(segment.rms) ? segment.rms : spectralFrame?.rms,
          isSilence: segment.isSilence === true || spectralFrame?.isSilence === true,
        };
      });
      const rebuilt = buildHarmonicRegions(pulseFrames, data.durationMs, data.bpm);
      rebuilt.forEach((region) => {
        if (region.isSilence) return;
        const retained = new Map();
        previousRegions.filter((previous) => previous.selectedSymbol && previous.endMs > region.startMs && previous.startMs < region.endMs)
          .forEach((previous) => {
            const overlap = Math.max(0, Math.min(region.endMs, previous.endMs) - Math.max(region.startMs, previous.startMs));
            retained.set(previous.selectedSymbol, (retained.get(previous.selectedSymbol) || 0) + overlap);
          });
        const [symbol] = [...retained].sort((left, right) => right[1] - left[1])[0] || [];
        if (symbol) { region.selectedSymbol = symbol; region.selectionSource = 'manual'; region.accepted = true; }
      });
      data.harmonicRegions = rebuilt;
      data.harmonicSegmentationVersion = 5;
    }
    analysis = data;
    if (needsHarmonicMigration && !restored) scheduleProjectSave();
    if (!labSections.length) labSections = initialLabSections(analysis.durationMs);
    if (!labSections.some((section) => section.id === selectedSectionId)) selectedSectionId = labSections[0]?.id || null;
    refreshAnalysisSummary(); renderSections();
    const analysisView = createAudioAnalysisVisualizer({
      analysis,
      onChange: () => { refreshAnalysisSummary(); updateLiveReference(); scheduleProjectSave(); },
      onSelect: playAnalysisSegment,
      onSeek: (positionMs) => {
        if (mediaPlayer && Number.isFinite(positionMs)) {
          try { mediaPlayer.currentTime = Math.max(0, Math.min(analysis.durationMs, positionMs)) / 1000; }
          catch { /* Metadata may still be loading; the visual cursor remains seekable. */ }
        }
      },
      onMidiTransport: ({ state, positionMs, audioAudible, rate, eq }) => {
        if (Number.isFinite(rate)) playbackRate = Math.max(.35, Math.min(1, rate));
        if (eq) playbackEq = { low: Number(eq.low) || 0, mid: Number(eq.mid) || 0, high: Number(eq.high) || 0 };
        if (state === 'settings') { connectPlaybackEqualizer(); return; }
        if (!mediaPlayer) return;
        if (state === 'playing') {
          connectPlaybackEqualizer();
          mediaPlayer.playbackRate = playbackRate;
          mediaPlayer.muted = !audioAudible;
          if (audioAudible) {
            try { mediaPlayer.currentTime = Math.max(0, Math.min(analysis.durationMs, positionMs)) / 1000; }
            catch { /* Metadata may still be loading. */ }
            mediaPlayer.play().catch(() => { transportStatus.textContent = 'Pulsa reproducir en la pista para habilitar el audio junto con MIDI.'; });
          } else mediaPlayer.pause();
        } else {
          mediaPlayer.pause();
          mediaPlayer.muted = false;
          if (state === 'stopped' || state === 'ended') {
            try { mediaPlayer.currentTime = Math.max(0, Math.min(analysis.durationMs, positionMs)) / 1000; }
            catch { /* Metadata may still be loading. */ }
          }
        }
      },
      getSection: (positionMs) => sectionAt(labSections, positionMs),
    });
    liveView?.dispose();
    transport.querySelector('.analysis-waveform')?.remove();
    transport.querySelector('.harmonic-history-host')?.remove();
    analysisPanel.replaceChildren(analysisView.element);
    transport.insertBefore(analysisView.waveformCanvas, mediaPreview);
    transport.insertBefore(analysisView.historyElement, mediaPreview);
    const sectionMap = el('section', { className: 'analysis-authored-sections', 'aria-label': 'Secciones de la canción' });
    sectionMap.dataset.analysisPanel = 'sections';
    sectionMap.append(el('h4', {}, 'Secciones'), sectionList);
    analysisView.element.insertBefore(sectionMap, analysisView.element.querySelector('.analysis-instruments'));
    analysisView.refreshPanels();
    requestAnimationFrame(() => analysisView.redraw());
    liveView = analysisView;
    multitrackView.setSource();
    livePlayerEvents(true);
    if (!restored) bpm.value = Number.isFinite(data.bpm) && data.bpm >= 20 && data.bpm <= 300 ? data.bpm.toFixed(2) : '';
    status.textContent = restored
      ? 'Análisis recuperado. Selecciona un tramo para escucharlo o edita la estructura y la letra.'
      : 'Análisis listo. Selecciona un tramo para escucharlo; escribe y guarda el proyecto para volver más tarde.';
    if (restored && needsHarmonicMigration) persistProject().catch(() => {});
    busy = false; analyze.disabled = false; create.disabled = false; saveLab.disabled = false;
    editMode.disabled = !linkedSongId; stageMode.disabled = !linkedSongId;
  }
  analyze.addEventListener('click', async () => {
    if (!selectedFile || busy) return;
    busy = true; analyze.disabled = true; create.disabled = true;
    status.textContent = 'Decodificando el archivo local…';
    try {
      decoded = await decodeLocalFile(selectedFile);
      waveform = buildWaveformEnvelope(decoded.pcm);
      status.textContent = `Audio decodificado · ${Math.round(decoded.durationMs / 1000)} s. Cargando analizador opcional…`;
      worker?.terminate(); worker = new Worker(ANALYSIS_WORKER_URL, { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          status.textContent = 'Essentia.js listo. Analizando tempo, pulsos y cromas…';
          worker.postMessage({ ...decoded, type: 'analyse' }, [decoded.pcm.buffer]);
        } else if (data.type === 'warning') {
          status.textContent += `\n${data.message}`;
        } else if (data.type === 'analysis') {
          data.waveform = waveform;
          showAnalysis(data);
          persistProject().catch(() => {});
          worker.terminate(); worker = null;
        } else if (data.type === 'error') fail(new Error(data.message));
      };
      worker.onerror = (event) => fail(new Error(event.message || 'Falló el Worker de audio.'));
      worker.postMessage({ type: 'init' });
    } catch (error) { fail(error); }
  });
  function livePlayerEvents(install = false) {
    if (!mediaPlayer) return;
    const callback = () => {
      if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
      playheadFrame = requestAnimationFrame(updatePlayhead);
    };
    if (install && playheadMediaPlayer !== mediaPlayer) {
      playheadMediaPlayer = mediaPlayer;
      ['play', 'pause', 'seeked', 'timeupdate', 'ended'].forEach((name) => mediaPlayer.addEventListener(name, (event) => {
        if (event.type === 'pause' && auditionEndMs !== null && playbackPositionMs() < auditionEndMs) {
          auditionEndMs = null; auditionArmed = false; auditionToken++;
          transportStatus.textContent = 'Escucha pausada. Selecciona el tramo para volver a oírlo.';
          liveView?.setAuditionStatus(transportStatus.textContent);
        }
        if (event.type === 'ended' && auditionEndMs !== null) {
          auditionEndMs = null; auditionArmed = false;
          transportStatus.textContent = 'Fin del audio. Selecciona otro tramo para escucharlo.';
          liveView?.setAuditionStatus(transportStatus.textContent);
        }
        if (event.type === 'play' && auditionEndMs === null) transportStatus.textContent = 'Reproduciendo la pista completa.';
        if (event.type === 'pause' && auditionEndMs === null && !transportStatus.textContent.startsWith('Fin')) {
          transportStatus.textContent = 'Pista pausada.';
        }
        callback();
      }));
    }
    callback();
  }
  async function startMicrophone() {
    if (liveCapture) return;
    micSwitch.disabled = true;
    micSwitchState.textContent = 'Iniciando…';
    liveStatus.textContent = 'Iniciando micrófono y analizador local…';
    liveScores = [];
    liveChordStabilizer.reset(); liveChordResult = null;
    livePitchTracker.reset(); currentLiveNote = null;
    try {
      liveCapture = createMicCapture({
        onFrame: (frame) => {
          liveInputQuality = frame.quality;
          if (frame.quality !== 'ok' || performance.now() - lastSignalDisplayAt > 300) {
            liveStatus.textContent = frame.quality === 'clipping'
              ? 'Entrada saturada: baja la ganancia del micrófono.'
              : frame.quality !== 'ok' ? 'Señal baja: acércate o aumenta la ganancia.'
                : `Escuchando localmente · nivel ${Math.round(frame.peak * 100)}%.`;
            lastSignalDisplayAt = performance.now();
          }
        },
        onHarmony: (frame) => {
          if (liveInputQuality !== 'ok') {
            liveView?.setLiveFrame(null);
            liveRadar.update([], '');
            livePitchTracker.reset(); currentLiveNote = null;
            liveChordStabilizer.reset(); liveChordResult = null;
            updateLiveNote(null);
            drawLiveSpectrum(null, null);
            liveGuess.textContent = liveInputQuality === 'clipping' ? 'Escucha: señal saturada' : 'Escucha: esperando señal clara';
            liveSimilarity.textContent = 'Afinidad armónica: pausada por nivel de señal';
            return;
          }
          if (frame.observedPerfMs && mediaPlayer && !mediaPlayer.paused) {
            const age = Math.max(0, performance.now() - frame.observedPerfMs);
            frame.playbackPositionMs = Math.max(0, playbackPositionMs() - age);
          }
          const segment = segmentAt(Number.isFinite(frame.playbackPositionMs) ? frame.playbackPositionMs : playbackPositionMs());
          frame.affinity = segment?.chroma ? compareChroma(segment.chroma, frame.chroma) : null;
          const bassPeak = (frame.bassPeaks || []).find((peak) => peak.strength >= 0.25);
          const bassPitchClass = Number.isInteger(bassPeak?.midi) ? ((bassPeak.midi % 12) + 12) % 12 : null;
          const frequency = Number(frame.pitchConfidence) >= 0.3 ? Number(frame.pitchHz) : 0;
          const fundamentalPitchClass = frequency > 0
            ? ((Math.round(69 + 12 * Math.log2(frequency / 440)) % 12) + 12) % 12 : null;
          const independentPeakCount = frequency > 0
            ? (frame.spectralPeaks || []).filter((peak) => {
              if (!(peak.frequencyHz > 0) || (peak.strength || 0) < 0.18) return false;
              const ratio = peak.frequencyHz / frequency;
              const harmonic = Math.max(1, Math.round(ratio));
              const centsFromHarmonic = Math.abs(1200 * Math.log2(ratio / harmonic));
              return centsFromHarmonic > 38;
            }).length : 0;
          liveChordResult = liveChordStabilizer.update(frame.chroma, frame.observedPerfMs || performance.now(),
            { bassPitchClass, fundamentalPitchClass, independentPeakCount });
          liveScores.push({ at: Date.now(), affinity: frame.affinity, frame });
          liveScores = liveScores.filter((item) => Date.now() - item.at < 5000).slice(-60);
          liveView?.setLiveFrame(frame);
          updateLiveNote(frame);
          updateLiveReference();
        },
        onStatus: (state) => { if (state.message) liveStatus.textContent = state.message; },
      });
      await liveCapture.start();
      micSwitch.checked = true;
      micSwitch.setAttribute('aria-checked', 'true');
      micSwitchState.textContent = 'Activo';
      try { localStorage.setItem(micPreferenceKey, 'true'); } catch { /* storage may be disabled */ }
      liveStatus.textContent = 'Micrófono activo · la pista no se envía ni se graba.';
    } catch (error) {
      liveStatus.textContent = error?.message || 'No se pudo iniciar el análisis en vivo.';
      await liveCapture?.dispose(); liveCapture = null;
      micSwitch.checked = false;
      micSwitch.setAttribute('aria-checked', 'false');
      micSwitchState.textContent = 'Apagado';
      try { localStorage.setItem(micPreferenceKey, 'false'); } catch { /* storage may be disabled */ }
    } finally {
      micSwitch.disabled = false;
    }
  }
  async function stopMicrophone() {
    await liveCapture?.stop(); liveCapture = null;
    micSwitch.checked = false;
    micSwitch.setAttribute('aria-checked', 'false');
    micSwitchState.textContent = 'Apagado';
    try { localStorage.setItem(micPreferenceKey, 'false'); } catch { /* storage may be disabled */ }
    liveView?.setLiveFrame(null);
    liveRadar.update([], '');
    livePitchTracker.reset();
    currentLiveNote = null;
    liveGuess.textContent = 'Escucha: —'; liveSimilarity.textContent = 'Afinidad armónica: —';
    liveTransition.textContent = 'Secuencia: —';
    liveCompatibility.textContent = 'Compatibilidad con el acorde elegido: —';
    liveChordStabilizer.reset(); liveChordResult = null;
    updateLiveNote(null);
    drawLiveSpectrum(null, null);
    liveStatus.textContent = 'Micrófono apagado';
    liveInputQuality = 'low';
  }
  micSwitch.setAttribute('aria-checked', 'false');
  micSwitch.addEventListener('change', () => micSwitch.checked ? startMicrophone() : stopMicrophone());
  referenceCheckbox.setAttribute('aria-checked', String(referenceCheckbox.checked));
  referenceCheckbox.addEventListener('change', () => referenceCheckbox.setAttribute('aria-checked', String(referenceCheckbox.checked)));
  keyboardHandler = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const arrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const loopSpace = event.code === 'Space' && workspace.dataset.workspace === 'looper';
    const editing = target instanceof HTMLElement && (target.isContentEditable
      || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || (!arrow && !loopSpace && target.tagName === 'BUTTON'));
    if (editing) return;
    const key = event.key.toLowerCase();
    if (arrow && workspace.dataset.workspace === 'autopsy') {
      event.preventDefault(); liveView?.moveSelection(event.key === 'ArrowRight' ? 1 : -1);
    } else if (key === 'm') {
      event.preventDefault(); micSwitch.checked = !micSwitch.checked; micSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (key === '1') setWorkspaceMode('autopsy');
    else if (key === '2') setWorkspaceMode('karaoke');
    else if (key === '3') setWorkspaceMode('stems');
    else if (key === '4') setWorkspaceMode('looper');
    else if (key === 'r') { referenceCheckbox.checked = !referenceCheckbox.checked; referenceCheckbox.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (event.code === 'Space' && workspace.dataset.workspace === 'looper') {
      event.preventDefault();
      if (!event.repeat) multitrackView.toggleRecording();
    } else if (key === 'p' && workspace.dataset.workspace === 'looper') {
      event.preventDefault(); multitrackView.togglePlay();
    } else if (event.key === 'Escape' && workspace.dataset.workspace === 'looper') {
      event.preventDefault(); multitrackView.stop();
    } else if (event.code === 'Space' && mediaPlayer) {
      event.preventDefault();
      if (mediaPlayer.paused) mediaPlayer.play().catch(() => {}); else mediaPlayer.pause();
    }
  };
  document.addEventListener('keydown', keyboardHandler);
  saveLab.addEventListener('click', () => { persistProject().catch(() => {}); });
  async function openLinkedView(openView) {
    if (!linkedSongId || !projectId) return;
    const song = await getSongV2(linkedSongId);
    if (!song) { status.textContent = 'La canción enlazada ya no existe. Crea otra desde este laboratorio.'; return; }
    const returnToLab = () => openAudioDraftAssistant({ projectId, onClose });
    if (!await cleanUp()) return;
    await openView(song, returnToLab);
  }
  editMode.addEventListener('click', () => { openLinkedView(openCalibrationEditor).catch((error) => { status.textContent = error.message; }); });
  stageMode.addEventListener('click', () => { openLinkedView(openPlayerView).catch((error) => { status.textContent = error.message; }); });
  [title, artist, bpm].forEach((input) => input.addEventListener('change', scheduleProjectSave));
  create.addEventListener('click', async () => {
    if (!analysis || busy) return;
    const bpmValue = Number(bpm.value);
    if (!title.value.trim() || !Number.isFinite(bpmValue) || bpmValue < 20 || bpmValue > 300) {
      status.textContent = 'Escribe un título y un BPM válido entre 20 y 300.'; return;
    }
    busy = true; create.disabled = true;
    try {
      await persistProject();
      const doc = buildLabSong({ title: title.value, artist: artist.value, durationMs: analysis.durationMs,
        bpm: bpmValue, chordSuggestions: analysis.chordSuggestions,
      uncertainChordCount: (analysis.harmonicRegions?.length || analysis.chordCandidates.length) - analysis.chordSuggestions.length,
        audioAssetId: projectAudioAssetId, sections: labSections });
      const collision = await import('./importDialog.js').then(({ askCollision }) => askCollision);
      const result = await importSongV2Document(doc, collision);
      if (result.status === 'invalid') throw new Error(result.errors.map((item) => `${item.instancePath}: ${item.message}`).join('\n'));
      if (result.status === 'cancelled') { busy = false; create.disabled = false; return; }
      linkedSongId = result.id;
      await persistProject();
      const saved = await getSongV2(result.id);
      if (!await cleanUp()) throw new Error('No se pudo cerrar el laboratorio porque falló el guardado.');
      await openCalibrationEditor(saved, () => openAudioDraftAssistant({ projectId, onClose }));
    } catch (error) {
      status.textContent = error?.message || 'No se pudo crear la canción.';
      busy = false; create.disabled = false;
    }
  });
  closeButton.addEventListener('click', cleanUp);
  document.getElementById('app').style.display = 'none';
  function attachStoredAsset(asset, fallbackName = 'pista') {
    selectedFile = new File([asset.blob], asset.name || fallbackName, { type: asset.mime || asset.blob.type });
    mediaUrl = URL.createObjectURL(asset.blob);
    mediaPlayer = document.createElement((asset.mime || '').startsWith('video/') ? 'video' : 'audio');
    mediaPlayer.controls = true; mediaPlayer.preload = 'metadata'; mediaPlayer.src = mediaUrl;
    mediaPreview.append(mediaPlayer);
    transportStatus.textContent = `Pista local recuperada: ${selectedFile.name}`;
  }
  if (existingProjectId) {
    try {
      const project = await getLabProject(existingProjectId);
      if (!project) throw new Error('No se encontró el proyecto de laboratorio.');
      title.value = project.title || ''; artist.value = project.artist || '';
      bpm.value = Number.isFinite(project.bpm) ? String(project.bpm) : '';
      labSections = project.sections?.length ? project.sections : (project.analysis?.durationMs ? initialLabSections(project.analysis.durationMs) : []);
      selectedSectionId = project.selectedSectionId || null;
      projectAudioAssetId = project.audioAssetId || null;
      linkedSongId = project.songId || null;
      multitrackView.restoreState({ stems: project.stems || [], loop: project.loop || {} });
      if (projectAudioAssetId) {
        const asset = await getAsset(projectAudioAssetId);
        if (asset?.blob) attachStoredAsset(asset, project.fileName);
        else transportStatus.textContent = 'El análisis se recuperó, pero falta el archivo de audio local.';
      } else transportStatus.textContent = 'Este análisis se guardó sin pista. Elige un archivo y vuelve a analizarlo para escuchar.';
      multitrackView.setSource();
      if (project.analysis) showAnalysis(project.analysis, { restored: true });
      else {
        saveLab.disabled = false;
        status.textContent = selectedFile
          ? 'Proyecto multipista recuperado. Analiza la mezcla o trabaja con las pistas guardadas.'
          : 'Proyecto multipista recuperado. Vuelve a importar las pistas locales para escucharlas.';
      }
    } catch (error) { status.textContent = error?.message || 'No se pudo abrir el laboratorio.'; }
  } else if (songId) {
    try {
      const song = await getSongV2(songId);
      if (!song) throw new Error('No se encontró la canción.');
      title.value = song.metadata.title; artist.value = song.metadata.artist || '';
      bpm.value = String(song.metadata.bpm);
      linkedSongId = song.id;
      const asset = song.audio?.assetId ? await getAsset(song.audio.assetId) : null;
      if (!asset?.blob) throw new Error('Esta canción no tiene el audio local disponible para analizar.');
      projectAudioAssetId = asset.id;
      attachStoredAsset(asset);
      status.textContent = 'Pista de la canción vinculada. Pulsa «Analizar archivo» para abrirla en el laboratorio.';
    } catch (error) { status.textContent = error?.message || 'No se pudo preparar el audio de la canción.'; }
  }
  title.focus();
  return { close: cleanUp };
}
