import { decodeLocalFile } from '../audio/decodeLocalFile.js';
import { importSongV2Document } from '../data/importSongV2.js';
import { getSongV2, getLabProject, getAsset, saveLabProject, saveLabProjectWithAsset } from '../data/indexedDb.js';
import { openCalibrationEditor } from './calibrationEditor.js';
import { openPlayerView } from './playerView.js';
import { cacheOptionalAudioTools } from '../data/offline.js';
import { createAudioAnalysisVisualizer } from './audioAnalysisVisualizer.js';
import { createMicCapture } from '../audio/micCapture.js';
import { matchChordTemplate } from '../audio/chordTemplateMatch.js';
import { compareChroma } from '../audio/chromaSimilarity.js';
import { scoreChordChroma } from '../music/chromaMatch.js';
import { getAuditionRange } from '../audio/auditionRange.js';
import { initialLabSections, sectionAt, splitLabSection, buildLabSong } from '../audio/labComposition.js';
import { buildWaveformEnvelope } from '../audio/waveformEnvelope.js';
import { createLiveHarmonicRadar } from './harmonicCircle.js';

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
  let liveCapture = null;
  let liveView = null;
  let liveScores = [];
  let lastLiveSegmentStartMs = null;
  let smoothedLiveChroma = [];
  let pendingLiveNote = null;
  let pendingLiveNoteCount = 0;
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
  let selectedSectionId = null;
  let linkedSongId = null;
  let busy = false;
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
  liveNoteCard.append(el('span', { className: 'live-note-label' }, 'NOTA ESTIMADA AHORA'), liveNoteName, liveNoteInfo);
  const liveVisuals = el('div', { className: 'audio-live-visuals' });
  liveVisuals.append(liveRadar.element, liveNoteCard);
  const liveStatus = el('p', { className: 'audio-live-status', role: 'status', 'aria-live': 'polite' }, 'Micrófono apagado');
  const liveReference = el('strong', { className: 'audio-live-reference' }, 'Referencia: —');
  const liveTransition = el('strong', { className: 'audio-live-transition' }, 'Secuencia: —');
  const liveGuess = el('strong', { className: 'audio-live-guess' }, 'Escucha: —');
  const liveSimilarity = el('strong', { className: 'audio-live-similarity' }, 'Afinidad armónica: —');
  const liveCompatibility = el('p', { className: 'audio-live-compatibility' }, 'Compatibilidad con el acorde elegido: —');
  const liveStart = el('button', { type: 'button', className: 'btn-primary' }, 'Iniciar escucha por micrófono');
  const liveStop = el('button', { type: 'button', className: 'btn-secondary', disabled: 'true' }, 'Apagar micrófono');
  const liveMetrics = el('div', { className: 'audio-live-metrics' });
  liveMetrics.append(liveReference, liveTransition, liveGuess, liveSimilarity);
  const liveActions = el('footer', { className: 'audio-draft-actions' }); liveActions.append(liveStart, liveStop);
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
    liveStatus, liveMetrics, liveCompatibility, liveVisuals, liveActions);
  const labHeader = el('header', { className: 'lab-header' });
  const modes = el('nav', { className: 'lab-mode-nav', 'aria-label': 'Vistas del proyecto' });
  modes.append(el('span', { className: 'lab-mode-active', 'aria-current': 'page' }, 'Laboratorio'), editMode, stageMode);
  const headerBrand = el('div', { className: 'lab-header-brand' }); headerBrand.append(heading);
  const headerHelp = el('button', { type: 'button', className: 'analysis-help-tip lab-header-help' }, '?');
  headerHelp.dataset.tip = 'Selecciona un tramo del mapa para escuchar y estudiar cómo cambia la armonía. El acorde aproximado se puede corregir; las posiciones muestran notas posibles para tocar.';
  headerHelp.setAttribute('aria-label', headerHelp.dataset.tip);
  headerBrand.append(headerHelp);
  labHeader.append(headerBrand, modes, headerHelp, closeButton);
  const transport = el('section', { className: 'lab-transport', 'aria-label': 'Reproducción de la pista' });
  transport.append(mediaPreview, transportStatus);
  const sidebar = el('aside', { className: 'lab-sidebar' });
  sidebar.append(el('h2', {}, 'Fuente y proyecto'), form, status, preview, actions, sectionPanel);
  const workspace = el('div', { className: 'lab-workspace' }); workspace.append(sidebar, analysisPanel);
  dialog.append(labHeader, transport, workspace, livePanel);
  document.body.append(dialog);

  function projectSnapshot() {
    return { id: projectId, schemaVersion: 1, title: title.value.trim(), artist: artist.value.trim(),
      bpm: Number(bpm.value) || analysis.bpm, updatedAt: new Date().toISOString(),
      audioAssetId: projectAudioAssetId, fileName: selectedFile?.name || '',
      songId: linkedSongId, selectedSectionId, analysis: structuredClone(analysis), sections: structuredClone(labSections) };
  }
  function persistProject() {
    if (!analysis) return Promise.resolve();
    if (!projectId) projectId = `lab-${crypto.randomUUID?.() || Date.now()}`;
    if (selectedFile && !projectAudioAssetId) {
      projectAudioAssetId = createAssetId();
      pendingAsset = { id: projectAudioAssetId, blob: selectedFile, name: selectedFile.name,
        mime: selectedFile.type || 'application/octet-stream', bytes: selectedFile.size,
        duration: analysis.durationMs / 1000 };
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
    if (!analysis) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persistProject().catch(() => {}); }, 500);
  }
  async function cleanUp() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (analysis) {
      try { await persistProject(); } catch { return false; }
    }
    if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
    liveView?.dispose();
    liveCapture?.dispose(); liveCapture = null;
    mediaPlayer?.pause(); mediaPlayer = null;
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
    const index = analysis.chordCandidates.indexOf(segment);
    const range = getAuditionRange(analysis.chordCandidates, index);
    if (!range) return;
    selectedSectionId = sectionAt(labSections, range.startMs)?.id || null;
    renderSections();
    playRange(range.startMs, range.endMs, `tramo ${index + 1}${range.symbol ? ` · ${range.symbol}` : ''}`);
  }
  function currentSegment() {
    return segmentAt(playbackPositionMs());
  }
  function segmentAt(position) {
    return analysis?.chordCandidates.find((segment) => position >= segment.startMs && position < segment.endMs)
      || analysis?.chordCandidates.at(-1) || null;
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
    const peaks = frame?.spectralPeaks || [];
    const peak = peaks.filter((item) => Number.isFinite(item.midi) && item.midi >= 28 && item.midi <= 96)
      .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
    if (!peak || (peak.strength || 0) < 0.12) {
      pendingLiveNote = null; pendingLiveNoteCount = 0;
      liveNoteName.textContent = '—'; liveNoteInfo.textContent = 'No hay una nota clara en la señal';
      return;
    }
    const key = `${peak.midi}:${peak.note || ''}`;
    if (key === pendingLiveNote) pendingLiveNoteCount++;
    else { pendingLiveNote = key; pendingLiveNoteCount = 1; }
    if (pendingLiveNoteCount >= 2) currentLiveNote = peak;
    if (!currentLiveNote) { liveNoteName.textContent = '…'; liveNoteInfo.textContent = 'Confirmando altura'; return; }
    liveNoteName.textContent = currentLiveNote.note || `MIDI ${currentLiveNote.midi}`;
    liveNoteInfo.textContent = `${Math.round(currentLiveNote.frequencyHz || 0)} Hz · pico espectral dominante (octava estimada)`;
  }
  function updateLiveReference() {
    const segment = currentSegment();
    if (!segment) return;
    const referenceSymbol = segment.selectedSymbol || segment.symbol;
    liveReference.textContent = segment.selectedSymbol
      ? `Referencia elegida: ${segment.selectedSymbol}`
      : `Referencia automática (sin confirmar): ${segment.symbol || 'sin acorde claro'}`;
    const currentIndex = analysis.chordCandidates.indexOf(segment);
    const previous = currentIndex > 0 ? analysis.chordCandidates[currentIndex - 1] : null;
    const previousSymbol = previous?.selectedSymbol || previous?.symbol;
    liveTransition.textContent = previousSymbol && referenceSymbol
      ? `Secuencia de referencia: ${previousSymbol} → ${referenceSymbol}${previous?.selectedSymbol && segment.selectedSymbol ? ' · elegida' : ' · propuesta'}`
      : 'Secuencia: sin acorde anterior para comparar';
    if (liveScores.length && liveScores.at(-1).frame) {
      const frame = liveScores.at(-1).frame;
      const guess = matchChordTemplate(smoothedLiveChroma.length ? smoothedLiveChroma : frame.chroma, { minScore: 0.5, minMargin: 0.03 });
      liveRadar.update(smoothedLiveChroma.length ? smoothedLiveChroma : frame.chroma, guess.symbol || '');
      const matches = guess.symbol === referenceSymbol;
      liveGuess.textContent = `Escucha estimada: ${guess.symbol} · ajuste ${guess.score.toFixed(2)}${matches ? ' · coincide con el tramo' : ''}`;
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
      liveView?.setPlaybackPosition(playbackPositionMs(), { followSelection: auditionEndMs === null });
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
    liveCapture?.dispose(); liveCapture = null; liveStop.disabled = true; liveStart.disabled = false;
    livePanel.hidden = true; liveView?.dispose(); liveView = null; liveScores = []; lastLiveSegmentStartMs = null;
    auditionEndMs = null; auditionArmed = false; auditionToken++; projectId = null; projectAudioAssetId = null; pendingAsset = null; linkedSongId = null;
    editMode.disabled = true; stageMode.disabled = true;
    labSections = []; selectedSectionId = null; renderSections();
    mediaPlayer?.pause(); mediaPlayer = null; playheadMediaPlayer = null;
    transport.querySelector('.analysis-waveform')?.remove();
    transport.querySelector('.harmonic-history-host')?.remove();
    selectedFile = file.files?.[0] || null; decoded = null; waveform = []; analysis = null; create.disabled = true;
    analysisPanel.replaceChildren(el('div', { className: 'lab-empty-map' }, 'Carga una pista y pulsa «Analizar archivo» para construir el mapa del sonido.'));
    mediaPreview.replaceChildren(); mediaPlayer = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    if (!selectedFile) return;
    mediaUrl = URL.createObjectURL(selectedFile);
    mediaPlayer = document.createElement(selectedFile.type.startsWith('video/') ? 'video' : 'audio');
    mediaPlayer.controls = true; mediaPlayer.preload = 'metadata'; mediaPlayer.src = mediaUrl;
    mediaPreview.append(mediaPlayer);
    transportStatus.textContent = `Pista lista: ${selectedFile.name}`;
    title.value = selectedFile.name.replace(/\.[^.]+$/, '').slice(0, 200);
    preview.textContent = `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MiB`;
    status.textContent = 'Archivo elegido. Pulsa Analizar archivo para decodificarlo localmente.';
  });
  function refreshAnalysisSummary() {
    if (!analysis) return;
    analysis.chordSuggestions = analysis.chordCandidates.filter((segment) => segment.selectedSymbol)
      .map((segment) => ({ symbol: segment.selectedSymbol, startMs: segment.startMs, endMs: segment.endMs }));
    const unassigned = analysis.chordCandidates.length - analysis.chordSuggestions.length;
    preview.textContent = `${selectedFile?.name || 'Pista no vinculada'}\nDuración: ${(analysis.durationMs / 1000).toFixed(1)} s\nBPM sugerido: ${Number.isFinite(analysis.bpm) ? analysis.bpm.toFixed(1) : 'no disponible'}\nPulsos detectados: ${analysis.beats?.length || 0}\nTramos estudiables: ${analysis.chordCandidates.length}\nAcordes elegidos: ${analysis.chordSuggestions.length} · sin asignar: ${unassigned}`;
  }
  function showAnalysis(data, { restored = false } = {}) {
    analysis = data;
    if (!labSections.length) labSections = initialLabSections(analysis.durationMs);
    if (!labSections.some((section) => section.id === selectedSectionId)) selectedSectionId = labSections[0]?.id || null;
    refreshAnalysisSummary(); renderSections();
    const analysisView = createAudioAnalysisVisualizer({
      analysis,
      onChange: () => { refreshAnalysisSummary(); updateLiveReference(); scheduleProjectSave(); },
      onSelect: playAnalysisSegment,
      getSection: (positionMs) => sectionAt(labSections, positionMs),
    });
    liveView?.dispose();
    transport.querySelector('.analysis-waveform')?.remove();
    transport.querySelector('.harmonic-history-host')?.remove();
    analysisPanel.replaceChildren(analysisView.element);
    transport.insertBefore(analysisView.waveformCanvas, mediaPreview);
    transport.insertBefore(analysisView.historyElement, mediaPreview);
    const sectionMap = el('section', { className: 'analysis-authored-sections', 'aria-label': 'Secciones de la canción' });
    sectionMap.append(el('h4', {}, 'Secciones'), sectionList);
    analysisView.element.insertBefore(sectionMap, analysisView.element.querySelector('.analysis-instruments'));
    requestAnimationFrame(() => analysisView.redraw());
    liveView = analysisView;
    livePanel.hidden = false;
    livePlayerEvents(true);
    if (!restored) bpm.value = Number.isFinite(data.bpm) && data.bpm >= 20 && data.bpm <= 300 ? data.bpm.toFixed(2) : '';
    status.textContent = restored
      ? 'Análisis recuperado. Selecciona un tramo para escucharlo o edita la estructura y la letra.'
      : 'Análisis listo. Selecciona un tramo para escucharlo; escribe y guarda el proyecto para volver más tarde.';
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
  liveStart.addEventListener('click', async () => {
    if (!analysis || liveCapture) return;
    liveStart.disabled = true;
    liveStatus.textContent = 'Iniciando micrófono y analizador local…';
    liveScores = [];
    smoothedLiveChroma = [];
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
            updateLiveNote(null);
            currentLiveNote = null;
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
          smoothedLiveChroma = Array.from({ length: 12 }, (_, index) => {
            const previous = smoothedLiveChroma[index] || 0;
            return previous * 0.65 + frame.chroma[index] * 0.35;
          });
          liveScores.push({ at: Date.now(), affinity: frame.affinity, frame });
          liveScores = liveScores.filter((item) => Date.now() - item.at < 5000).slice(-60);
          liveView?.setLiveFrame(frame);
          updateLiveNote(frame);
          updateLiveReference();
        },
        onStatus: (state) => { if (state.message) liveStatus.textContent = state.message; },
      });
      await liveCapture.start();
      liveStop.disabled = false;
      liveStatus.textContent = 'Micrófono activo · la pista no se envía ni se graba.';
    } catch (error) {
      liveStatus.textContent = error?.message || 'No se pudo iniciar el análisis en vivo.';
      await liveCapture?.dispose(); liveCapture = null; liveStart.disabled = false;
    }
  });
  liveStop.addEventListener('click', async () => {
    await liveCapture?.stop(); liveCapture = null;
    liveStop.disabled = true; liveStart.disabled = false;
    liveView?.setLiveFrame(null);
    liveRadar.update([], '');
    updateLiveNote(null); currentLiveNote = null;
    liveGuess.textContent = 'Escucha: —'; liveSimilarity.textContent = 'Afinidad armónica: —';
    liveTransition.textContent = 'Secuencia: —';
    liveCompatibility.textContent = 'Compatibilidad con el acorde elegido: —';
    smoothedLiveChroma = [];
    liveStatus.textContent = 'Micrófono apagado';
    liveInputQuality = 'low';
  });
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
        uncertainChordCount: analysis.chordCandidates.length - analysis.chordSuggestions.length,
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
      labSections = project.sections?.length ? project.sections : initialLabSections(project.analysis.durationMs);
      selectedSectionId = project.selectedSectionId || null;
      projectAudioAssetId = project.audioAssetId || null;
      linkedSongId = project.songId || null;
      if (projectAudioAssetId) {
        const asset = await getAsset(projectAudioAssetId);
        if (asset?.blob) attachStoredAsset(asset, project.fileName);
        else transportStatus.textContent = 'El análisis se recuperó, pero falta el archivo de audio local.';
      } else transportStatus.textContent = 'Este análisis se guardó sin pista. Elige un archivo y vuelve a analizarlo para escuchar.';
      showAnalysis(project.analysis, { restored: true });
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
