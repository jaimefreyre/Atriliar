import { getAsset, saveAsset } from '../data/indexedDb.js';
import { decodeLocalFile } from '../audio/decodeLocalFile.js';
import { extractMidiVoices } from '../audio/midiVoices.js';
import { parseMidiFile } from '../audio/midiFile.js';
import { loopRecordingSlice } from '../audio/loopRecording.js';
import { audioBufferToWav, resizeAudioClip } from '../audio/loopEditing.js';

const STEM_LABELS = Object.freeze({ vocals: 'Voz', drums: 'Ritmo y percusión', bass: 'Bajo', other: 'Acompañamiento', guitar: 'Guitarra', piano: 'Piano' });
const STEM_NAMES = Object.freeze({ voz: 'vocals', vocal: 'vocals', voice: 'vocals', guitarra: 'guitar', guitar: 'guitar', bajo: 'bass', bass: 'bass', ritmo: 'drums', bateria: 'drums', batería: 'drums', drums: 'drums', percusion: 'drums', percusión: 'drums', piano: 'piano' });

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function labelForStem(key, fallback = '') { return STEM_LABELS[key] || fallback || key; }

function timeLabel(valueMs) {
  const seconds = Math.max(0, valueMs / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}

function numberInput(value, step = '.1', label = '') {
  const input = element('input', 'multi-number'); input.type = 'number'; input.min = '0'; input.step = step; input.value = String(value);
  if (label) input.setAttribute('aria-label', label);
  return input;
}

function stemKey(filename) {
  const name = filename.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [token, key] of Object.entries(STEM_NAMES)) if (name.includes(token)) return key;
  return 'other';
}

function midiNotesFromAnalysis(data) {
  const tracks = extractMidiVoices(data.spectralFrames || [], { startMs: 0, endMs: data.durationMs });
  return Object.values(tracks).flatMap((events) => events.map((event) => ({
    midi: event.midi, startMs: event.startMs, endMs: event.endMs,
    velocity: Math.max(.2, Math.min(1, event.level ?? event.strength ?? .7)), register: event.register,
  })));
}

function publicProjectState(stems, loop) {
  return {
    stems: stems.map(({ runtimeAnalysis, blob, url, ...stem }) => structuredClone(stem)),
    loop: structuredClone(loop),
  };
}

/** Multipista autopsy and a compact, locally rendered audio/MIDI looper. */
export function createMultitrackWorkspace({
  initialStems = [], initialLoop = {}, getSourceFile = () => null, getSourceAssetId = () => null,
  getAnalysis = () => null, getSelectedRange = () => null, getBpm = () => 120,
  ensureAudioAsset = async (blob, name, durationMs) => {
    const id = makeId('asset');
    await saveAsset({ id, blob, name, mime: blob.type || 'application/octet-stream', bytes: blob.size || 0, duration: durationMs / 1000 });
    return id;
  }, onProjectChange = () => {}, onOpenLooper = () => {}, isActive = () => false,
} = {}) {
  const stemItems = (initialStems || []).map((item) => ({ ...item }));
  const defaultDuration = Math.max(1000, Number(getAnalysis()?.durationMs) || 60000);
  const defaultLoopLengthMs = Math.min(30000, defaultDuration);
  let loopEndWasAutomatic = !Number(initialLoop.loopEndMs);
  const loop = {
    bpm: Number(initialLoop.bpm) || Number(getBpm()) || 120,
    loopStartMs: Number(initialLoop.loopStartMs) || 0,
    loopEndMs: Number(initialLoop.loopEndMs) || defaultLoopLengthMs,
    loopEnabled: initialLoop.loopEnabled !== false,
    masterGain: Math.max(0, Math.min(1.25, Number(initialLoop.masterGain ?? .85))),
    zoom: Math.max(6, Math.min(36, Number(initialLoop.zoom) || 12)),
    snap: ['bar', 'beat', 'eighth', 'sixteenth', 'off'].includes(initialLoop.snap) ? initialLoop.snap : 'beat',
    positionMs: Number(initialLoop.positionMs) || 0,
    tracks: Array.isArray(initialLoop.tracks) ? initialLoop.tracks.map((track) => ({ ...track })) : [],
  };
  const audioPanel = element('section', 'multipista-screen');
  audioPanel.dataset.workspaceScreen = 'stems';
  const looperPanel = element('section', 'loopera-screen');
  looperPanel.dataset.workspaceScreen = 'looper';
  const blobCache = new Map();
  const urlCache = new Map();
  const bufferCache = new Map();
  const trackNodes = new Map();
  const trackPanners = new Map();
  let separationBusy = false;
  let separationAvailable = false;
  let sourceFileUrl = null;
  let sourceFileUrlOwner = null;
  let workerBusy = false;
  let audioContext = null;
  let masterGain = null;
  let masterCompressor = null;
  let trackGains = new Map();
  let liveSources = new Set();
  let playbackTimer = null;
  let playbackClock = null;
  let playbackPositionMs = loop.positionMs;
  let playbackRate = 1;
  let scheduled = new Set();
  let recordedStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStarting = false;
  let recordingAnalyser = null;
  let recordingInputSource = null;
  let recordingMeterSink = null;
  let recordingSamples = null;
  let recordingFailure = null;
  let lastRecordingStatusAt = 0;
  let recordStartedAt = 0;
  let recordStartedSongMs = 0;
  let pendingRecordingSave = Promise.resolve();
  let pendingTake = null;
  let recordingTargetMs = null;
  let recordingSongProgressMs = 0;
  let lastRecordingTick = 0;
  let recordingStopReason = 'manual';
  let resizingClip = null;
  let selectedClipRef = null;
  let sourceAutoLoadFile = null;

  function projectChanged() {
    loop.positionMs = playbackPositionMs;
    loop.endAutomatic = loopEndWasAutomatic;
    onProjectChange(publicProjectState(stemItems, loop));
  }

  async function getStemBlob(stem) {
    if (stem.blob instanceof Blob) return stem.blob;
    if (blobCache.has(stem.assetId)) return blobCache.get(stem.assetId);
    const asset = stem.assetId ? await getAsset(stem.assetId) : null;
    const blob = asset?.blob || null;
    if (blob) blobCache.set(stem.assetId, blob);
    return blob;
  }

  function cachedUrl(assetId, blob) {
    if (!urlCache.has(assetId)) urlCache.set(assetId, URL.createObjectURL(blob));
    return urlCache.get(assetId);
  }

  function findAudioTrack(assetId) {
    return loop.tracks.find((track) => track.kind === 'audio'
      && (track.assetId === assetId || (track.clips || []).some((clip) => clip.assetId === assetId)));
  }

  function ensureAudioTrack(stem, { startMs = 0, sourceStartMs = 0, durationMs = stem.durationMs, muted = false } = {}) {
    if (!stem?.assetId) return null;
    let track = findAudioTrack(stem.assetId);
    if (!track) {
      track = { id: makeId('track'), name: stem.name, kind: 'audio', assetId: stem.assetId, source: stem.source || 'import',
        gain: 1, pan: 0, muted, solo: false, clips: [] };
      loop.tracks.push(track);
    }
    const duplicate = (track.clips || []).some((clip) => clip.assetId === stem.assetId
      && Math.abs((Number(clip.startMs) || 0) - startMs) < 1
      && Math.abs((Number(clip.sourceStartMs) || 0) - sourceStartMs) < 1
      && Math.abs((Number(clip.durationMs) || 0) - durationMs) < 1);
    if (!duplicate) track.clips.push({ id: makeId('clip'), name: stem.name, assetId: stem.assetId,
      startMs, sourceStartMs, durationMs: Math.max(100, Number(durationMs) || defaultDuration) });
    return track;
  }

  async function addStemToLooper(stem) {
    const track = ensureAudioTrack(stem, { startMs: 0, sourceStartMs: 0, durationMs: stem.durationMs });
    if (!track) return null;
    if (stem.source === 'demucs' || stem.source === 'import') {
      for (const candidate of loop.tracks) {
        if (candidate.kind === 'audio' && candidate.source === 'original') candidate.muted = true;
      }
    }
    renderLooper(); projectChanged();
    return track;
  }

  async function estimateDuration(blob) {
    return new Promise((resolve) => {
      const audio = new Audio(); const url = URL.createObjectURL(blob);
      const done = (value) => { URL.revokeObjectURL(url); audio.removeAttribute('src'); resolve(value); };
      audio.preload = 'metadata'; audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration * 1000 : defaultDuration);
      audio.onerror = () => done(defaultDuration); audio.src = url;
    });
  }

  async function storeStem(blob, name, stemType, durationMs = defaultDuration, source = 'import') {
    const id = makeId('stem');
    const assetId = await ensureAudioAsset(blob, name, durationMs);
    const stem = { id, name, stemType, assetId, durationMs, source, analysisSummary: null };
    blobCache.set(assetId, blob);
    stemItems.push(stem);
    await addStemToLooper(stem);
    projectChanged(); renderStems(); return stem;
  }

  function sourceFile() { return getSourceFile(); }
  function regionValues() {
    const max = Math.max(1, Number(getAnalysis()?.durationMs) || defaultDuration);
    const startMs = Math.max(0, Math.min(max, Number(regionStart.value) * 1000 || 0));
    const endMs = Math.max(startMs + 100, Math.min(max, Number(regionEnd.value) * 1000 || max));
    return { startMs, endMs: Math.min(max, endMs), durationMs: Math.max(100, Math.min(max, endMs) - startMs) };
  }

  function makeHarmonyMap(regions, durationMs, player) {
    const valid = (regions || []).filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs > item.startMs);
    if (!valid.length || !(durationMs > 0)) return null;
    const map = element('div', 'multi-harmony-map');
    map.setAttribute('role', 'group'); map.setAttribute('aria-label', 'Mapa temporal de los acordes sugeridos para esta pista');
    for (const region of valid) {
      const symbol = region.isSilence ? 'Silencio' : region.symbol || 'Sin definir';
      const start = Math.max(0, Math.min(durationMs, region.startMs));
      const end = Math.max(start, Math.min(durationMs, region.endMs));
      if (end <= start) continue;
      const block = element('button', 'multi-harmony-region', end - start > durationMs * .065 ? symbol : '');
      block.type = 'button'; block.style.left = `${start / durationMs * 100}%`;
      block.style.width = `${Math.max(.35, (end - start) / durationMs * 100)}%`;
      block.style.opacity = String(Math.max(.42, Math.min(1, .45 + (Number(region.confidence) || 0) * .55)));
      block.title = `${symbol} · ${timeLabel(start)}–${timeLabel(end)} · confianza orientativa ${Math.round((Number(region.confidence) || 0) * 100)}%`;
      block.setAttribute('aria-label', block.title);
      block.addEventListener('click', () => {
        map.querySelectorAll('.is-selected').forEach((item) => item.classList.remove('is-selected'));
        block.classList.add('is-selected');
        if (player) {
          try { player.currentTime = start / 1000; } catch { /* El navegador espera metadatos de la pista. */ }
          player.play().catch(() => {});
        }
      });
      map.append(block);
    }
    return map;
  }

  const stemHeading = element('header', 'multi-screen-heading');
  stemHeading.append(element('div', '', 'Autopsia multipista'), element('p', '', 'Separa fuentes aproximadas y analiza cada pista para comparar qué instrumento sostiene cada nota y acorde.'));
  audioPanel.append(stemHeading);
  const sourceCard = element('section', 'multi-card multi-source-card');
  sourceCard.append(element('h3', '', 'Audio de origen'));
  const sourceMeta = element('p', 'multi-muted', 'Carga un audio desde Fuente y proyecto para empezar.');
  const sourceAudio = element('audio', 'multi-audio'); sourceAudio.controls = true; sourceAudio.preload = 'metadata';
  const sourceActions = element('div', 'multi-actions');
  const addOriginal = element('button', 'multi-button', 'Añadir tramo original'); addOriginal.type = 'button';
  const modelSelect = element('select', 'multi-select');
  modelSelect.add(new Option('4 pistas · voz, ritmo, bajo y acompañamiento', 'htdemucs'));
  modelSelect.add(new Option('6 pistas · suma guitarra y piano · experimental', 'htdemucs_6s'));
  const separateButton = element('button', 'multi-button is-primary', 'Separar con IA local'); separateButton.type = 'button';
  sourceActions.append(modelSelect, separateButton, addOriginal);
  const separatorStatus = element('p', 'multi-status', 'Comprobando si Demucs está instalado…'); separatorStatus.setAttribute('role', 'status');
  const setupDetails = element('details', 'multi-setup');
  setupDetails.append(element('summary', '', 'Instalar el separador local'), element('p', '', 'La separación usa un modelo grande y puede descargar sus pesos la primera vez. Instálalo en el equipo con Python:'));
  const setupCode = element('code', '', 'python -m pip install -U demucs'); setupDetails.append(setupCode);
  sourceCard.append(sourceMeta, sourceAudio, sourceActions, separatorStatus, setupDetails);
  const importCard = element('section', 'multi-card multi-import-card');
  importCard.append(element('h3', '', 'Importar pistas separadas'));
  importCard.append(element('p', 'multi-muted', 'Si ya tienes stems, impórtalos juntos. Se reconocen nombres como voz, bajo, guitarra, batería, piano y other.'));
  const importInput = element('input', 'multi-file-input'); importInput.type = 'file'; importInput.accept = 'audio/*'; importInput.multiple = true;
  const importLabel = element('label', 'multi-button', 'Elegir pistas de audio'); importLabel.append(importInput);
  importCard.append(importLabel);
  const rangeCard = element('section', 'multi-card multi-range-card');
  rangeCard.append(element('h3', '', 'Fragmento para enviar a la loopera'));
  const rangeControls = element('div', 'multi-range-controls');
  const regionStart = numberInput(0, '.1', 'Inicio del fragmento en segundos');
  const regionEnd = numberInput(defaultDuration / 1000, '.1', 'Final del fragmento en segundos');
  const selectedRegion = element('button', 'multi-button', 'Tomar tramo seleccionado'); selectedRegion.type = 'button';
  selectedRegion.addEventListener('click', () => {
    const range = getSelectedRange();
    if (range) { regionStart.value = (range.startMs / 1000).toFixed(1); regionEnd.value = (range.endMs / 1000).toFixed(1); }
  });
  rangeControls.append(element('label', '', 'Desde (s)'), regionStart, element('label', '', 'Hasta (s)'), regionEnd, selectedRegion);
  rangeCard.append(rangeControls);
  const stemList = element('div', 'multi-stem-list');
  audioPanel.append(sourceCard, importCard, rangeCard, element('h3', 'multi-section-title', 'Pistas disponibles'), stemList);

  function refreshSource() {
    const file = sourceFile();
    const assetId = getSourceAssetId();
    if (!file) {
      sourceMeta.textContent = 'Carga un audio desde Fuente y proyecto para empezar.';
      sourceAudio.hidden = true; addOriginal.disabled = true; separateButton.disabled = true;
      if (sourceFileUrl) URL.revokeObjectURL(sourceFileUrl);
      sourceFileUrl = null; sourceFileUrlOwner = null; sourceAudio.removeAttribute('src');
      return;
    }
    sourceMeta.textContent = `${file.name} · ${getAnalysis()?.durationMs ? timeLabel(getAnalysis().durationMs) : 'pendiente de analizar'}`;
    sourceAudio.hidden = false; addOriginal.disabled = false; separateButton.disabled = !separationAvailable || separationBusy;
    let nextUrl;
    if (assetId && blobCache.has(assetId)) nextUrl = cachedUrl(assetId, blobCache.get(assetId));
    else {
      if (sourceFileUrlOwner !== file) {
        if (sourceFileUrl) URL.revokeObjectURL(sourceFileUrl);
        sourceFileUrl = URL.createObjectURL(file); sourceFileUrlOwner = file;
      }
      nextUrl = sourceFileUrl;
    }
    if (sourceAudio.getAttribute('src') !== nextUrl) sourceAudio.src = nextUrl;
  }

  async function checkSeparation() {
    try {
      const result = await fetch('/api/separation/status').then((response) => response.json());
      separationAvailable = Boolean(result.available);
      separatorStatus.textContent = result.message || (result.available ? 'Demucs listo.' : 'Separador no disponible.');
      separateButton.disabled = !result.available || !sourceFile() || separationBusy;
      setupDetails.hidden = Boolean(result.available);
    } catch {
      separationAvailable = false;
      separatorStatus.textContent = 'El servidor local no ofrece el separador. Puedes importar stems ya separados.';
      separateButton.disabled = true; setupDetails.hidden = false;
    }
  }

  async function separateSource() {
    const file = sourceFile();
    if (!file || separationBusy) return;
    separationBusy = true; separateButton.disabled = true; modelSelect.disabled = true;
    separatorStatus.textContent = 'Subiendo el audio al separador local…';
    try {
      const response = await fetch(`/api/separate?model=${encodeURIComponent(modelSelect.value)}&name=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'No se pudo iniciar la separación.');
      let current = job;
      while (current.status !== 'completed' && current.status !== 'failed') {
        separatorStatus.textContent = current.message || 'Separando las pistas en este equipo…';
        await new Promise((resolve) => setTimeout(resolve, 1500));
        current = await fetch(`/api/separate/${job.id}`).then((result) => result.json());
      }
      if (current.status === 'failed') throw new Error(current.message || 'La separación no pudo terminar.');
      for (const separated of current.stems || []) {
        const blob = await fetch(separated.url).then((result) => {
          if (!result.ok) throw new Error(`No se pudo recuperar la pista ${separated.name}.`);
          return result.blob();
        });
        const key = separated.name;
        await storeStem(blob, labelForStem(key), key, Number(getAnalysis()?.durationMs) || await estimateDuration(blob), 'demucs');
      }
      separatorStatus.textContent = `${current.message || 'Pistas separadas y guardadas.'} Se cargaron ${current.stems?.length || 0} pistas en la loopera.`;
      setupDetails.hidden = true;
      onOpenLooper();
    } catch (error) {
      separatorStatus.textContent = error.message || 'No se pudo separar el audio.';
      setupDetails.hidden = false;
    } finally {
      separationBusy = false; modelSelect.disabled = false; separateButton.disabled = !separationAvailable || !sourceFile();
      checkSeparation();
    }
  }
  separateButton.addEventListener('click', separateSource);
  importInput.addEventListener('change', async () => {
    const files = [...(importInput.files || [])];
    for (const file of files) {
      const key = stemKey(file.name), duration = Number(getAnalysis()?.durationMs) || await estimateDuration(file);
      try { await storeStem(file, labelForStem(key, file.name.replace(/\.[^.]+$/, '')), key, duration, 'import'); }
      catch (error) { separatorStatus.textContent = `No se pudo guardar ${file.name}: ${error.message}`; }
    }
    if (files.length) {
      separatorStatus.textContent = `${files.length} pista${files.length === 1 ? '' : 's'} añadida${files.length === 1 ? '' : 's'} automáticamente a la loopera.`;
      onOpenLooper();
    }
    importInput.value = '';
  });
  addOriginal.addEventListener('click', addSourceToLooper);

  async function addSourceToLooper() {
    const file = sourceFile();
    if (!file) return;
    const assetId = getSourceAssetId() || await ensureAudioAsset(file, file.name, Number(getAnalysis()?.durationMs) || defaultDuration);
    blobCache.set(assetId, file);
    addAudioClip({ id: `source:${assetId}`, name: 'Mezcla original', source: 'original', assetId,
      durationMs: Number(getAnalysis()?.durationMs) || await estimateDuration(file) }, regionValues());
    onOpenLooper();
  }

  async function syncTracksFromAssets() {
    const file = sourceFile();
    let changed = false;
    if (file) {
      const durationMs = Number(getAnalysis()?.durationMs) || defaultDuration;
      const assetId = getSourceAssetId() || await ensureAudioAsset(file, file.name, durationMs);
      if (sourceFile() !== file) return;
      blobCache.set(assetId, file);
      const sourceTrack = findAudioTrack(assetId);
      if (sourceTrack) {
        if (sourceTrack.source !== 'original') { sourceTrack.source = 'original'; changed = true; }
        const fullMix = sourceTrack.clips?.find((clip) => clip.startMs === 0 && clip.sourceStartMs === 0);
        if (fullMix && Math.abs((Number(fullMix.durationMs) || 0) - durationMs) > 100) { fullMix.durationMs = durationMs; changed = true; }
        else if (!fullMix) ensureAudioTrack({ assetId, name: 'Mezcla original', source: 'original', durationMs },
          { startMs: 0, sourceStartMs: 0, durationMs });
      }
      else {
        ensureAudioTrack({ assetId, name: 'Mezcla original', source: 'original', durationMs },
          { startMs: 0, sourceStartMs: 0, durationMs });
        changed = true;
      }
      sourceAutoLoadFile = file;
    } else sourceAutoLoadFile = null;
    for (const stem of stemItems) {
      if (findAudioTrack(stem.assetId) || !(await getStemBlob(stem))) continue;
      ensureAudioTrack(stem, { startMs: 0, sourceStartMs: 0, durationMs: stem.durationMs });
      changed = true;
    }
    if (stemItems.length) {
      for (const track of loop.tracks) if (track.kind === 'audio' && track.source === 'original' && !track.muted) {
        track.muted = true; changed = true;
      }
    }
    if (changed) { renderLooper(); projectChanged(); }
  }

  async function analyzeStem(stem, targetStatus) {
    if (workerBusy) { targetStatus.textContent = 'Espera a que termine el análisis de la otra pista.'; return; }
    const blob = await getStemBlob(stem);
    if (!blob) { targetStatus.textContent = 'No se encontró el archivo de esta pista.'; return; }
    workerBusy = true; targetStatus.textContent = 'Analizando esta pista de forma independiente…';
    let worker;
    try {
      const decoded = await decodeLocalFile(new File([blob], `${stem.name}.wav`, { type: blob.type || 'audio/wav' }));
      worker = new Worker(new URL('../audio/essentiaAnalysisWorker.js', import.meta.url), { type: 'module' });
      const data = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('El análisis tardó demasiado.')), 180000);
        worker.onmessage = ({ data: message }) => {
          if (message.type === 'ready') worker.postMessage({ ...decoded, type: 'analyse' }, [decoded.pcm.buffer]);
          else if (message.type === 'analysis') { clearTimeout(timeout); resolve(message); }
          else if (message.type === 'error') { clearTimeout(timeout); reject(new Error(message.message)); }
        };
        worker.onerror = (event) => { clearTimeout(timeout); reject(new Error(event.message || 'Falló el analizador.')); };
        worker.postMessage({ type: 'init' });
      });
      worker.terminate(); worker = null;
      stem.runtimeAnalysis = data;
      const regions = data.harmonicRegions?.length ? data.harmonicRegions : data.chordCandidates || [];
      stem.analysisSummary = {
        bpm: Number(data.bpm) || null,
        durationMs: data.durationMs,
        harmonies: regions.slice(0, 160).map((region) => ({ startMs: region.startMs, endMs: region.endMs,
          symbol: region.selectedSymbol || region.symbol || '', confidence: Number(region.confidence) || 0 })),
        noteCount: (data.spectralFrames || []).length,
      };
      projectChanged();
      targetStatus.replaceChildren();
      targetStatus.append(element('strong', '', `Análisis listo · ${Number(data.bpm) ? `${Number(data.bpm).toFixed(1)} BPM` : 'tempo no estimado'}`));
      const harmonyLine = element('p', 'multi-harmony-summary');
      const symbols = regions.filter((region) => region.symbol || region.selectedSymbol)
        .map((region) => `${timeLabel(region.startMs)} ${region.selectedSymbol || region.symbol}`);
      harmonyLine.textContent = symbols.slice(0, 24).join(' · ') || 'No se obtuvo un acorde claro en esta pista.';
      targetStatus.append(harmonyLine);
      const map = makeHarmonyMap(stem.analysisSummary.harmonies, stem.analysisSummary.durationMs, targetStatus.closest('.multi-stem-row')?.querySelector('audio'));
      if (map) targetStatus.append(map);
      targetStatus.dataset.ready = 'true';
      const midiButton = targetStatus.parentElement?.querySelector('[data-action="stem-midi"]');
      if (midiButton) midiButton.disabled = false;
    } catch (error) {
      targetStatus.textContent = error.message || 'No se pudo analizar esta pista.';
    } finally { worker?.terminate(); workerBusy = false; }
  }

  async function renderStems() {
    refreshSource(); stemList.replaceChildren();
    const file = sourceFile();
    if (file) {
      const sourceRow = element('article', 'multi-stem-row');
      const sourceInfo = element('div', 'multi-stem-info');
      sourceInfo.append(element('h4', '', file.name), element('p', '', 'Mezcla completa · referencia para comparar las pistas extraídas.'));
      const sourceControls = element('div', 'multi-actions');
      const sourceAnalyze = element('button', 'multi-button', 'Analizar mezcla'); sourceAnalyze.type = 'button'; sourceAnalyze.addEventListener('click', () => {
        const regions = getAnalysis()?.harmonicRegions || getAnalysis()?.chordCandidates || [];
        sourceInfo.querySelector('p').textContent = regions.length
          ? `Análisis ya disponible · ${regions.length} tramos para cotejar contra las pistas.`
          : 'Pulsa «Analizar archivo» en Fuente y proyecto para generar el mapa de la mezcla.';
      });
      sourceControls.append(sourceAnalyze, addOriginal.cloneNode(true));
      sourceControls.lastChild.addEventListener('click', addSourceToLooper);
      const sourceRegions = getAnalysis()?.harmonicRegions?.length ? getAnalysis().harmonicRegions : getAnalysis()?.chordCandidates || [];
      const sourceDuration = Number(getAnalysis()?.durationMs) || 0;
      const sourceMap = makeHarmonyMap(sourceRegions, sourceDuration, sourceAudio);
      if (sourceMap) sourceInfo.append(sourceMap);
      sourceRow.append(sourceInfo, sourceControls); stemList.append(sourceRow);
    }
    if (!stemItems.length) {
      stemList.append(element('p', 'multi-empty', 'Todavía no hay pistas separadas. Usa Demucs local o importa pistas ya separadas.'));
      return;
    }
    for (const stem of stemItems) {
      const row = element('article', 'multi-stem-row');
      const info = element('div', 'multi-stem-info');
      info.append(element('h4', '', stem.name), element('p', '', `${labelForStem(stem.stemType, stem.name)} · ${stem.source === 'demucs' ? 'separada localmente' : 'importada'} · ${timeLabel(stem.durationMs || 0)}`));
      const blob = await getStemBlob(stem);
      if (blob) {
        const player = element('audio', 'multi-audio'); player.controls = true; player.preload = 'metadata';
        player.src = cachedUrl(stem.assetId, blob); info.append(player);
      } else info.append(element('p', 'multi-warning', 'Falta el archivo de audio local de esta pista.'));
      const result = element('div', 'multi-stem-analysis');
      if (stem.analysisSummary) {
        result.dataset.ready = 'true';
        result.append(element('strong', '', `Análisis guardado · ${stem.analysisSummary.bpm ? `${stem.analysisSummary.bpm.toFixed(1)} BPM` : 'tempo no estimado'}`));
        const harmonyLine = element('p', 'multi-harmony-summary', (stem.analysisSummary.harmonies || [])
          .map((region) => `${timeLabel(region.startMs)} ${region.symbol || '—'}`).slice(0, 24).join(' · ') || 'Sin acordes definidos.');
        result.append(harmonyLine);
        const map = makeHarmonyMap(stem.analysisSummary.harmonies, stem.analysisSummary.durationMs, info.querySelector('audio'));
        if (map) result.append(map);
      } else result.append(element('p', 'multi-muted', 'Analiza esta fuente sola para obtener sus notas y cambios armónicos.'));
      const actions = element('div', 'multi-actions');
      const analyze = element('button', 'multi-button', 'Analizar pista'); analyze.type = 'button';
      analyze.addEventListener('click', () => analyzeStem(stem, result));
      const midi = element('button', 'multi-button', 'Enviar notas como MIDI'); midi.type = 'button'; midi.disabled = !stem.runtimeAnalysis;
      midi.dataset.action = 'stem-midi'; midi.addEventListener('click', () => addStemMidi(stem));
      const loopButton = element('button', 'multi-button is-primary', 'Agregar tramo a loopera'); loopButton.type = 'button';
      loopButton.addEventListener('click', async () => {
        if (!stem.assetId) return;
        addAudioClip(stem, regionValues()); onOpenLooper();
      });
      actions.append(analyze, midi, loopButton);
      row.append(info, result, actions); stemList.append(row);
    }
  }

  async function addStemMidi(stem) {
    const data = stem.runtimeAnalysis;
    if (!data) return;
    const region = regionValues();
    const notes = midiNotesFromAnalysis(data).filter((note) => note.endMs > region.startMs && note.startMs < region.endMs)
      .map((note) => ({ ...note, startMs: Math.max(0, note.startMs - region.startMs), endMs: Math.min(region.durationMs, note.endMs - region.startMs) }));
    if (!notes.length) return;
    loop.tracks.push({ id: makeId('track'), name: `${stem.name} · MIDI`, kind: 'midi', gain: 1, muted: false, solo: false,
      clips: [{ id: makeId('clip'), name: `${stem.name} · notas`, startMs: Number(addAt.value) * 1000 || 0,
        sourceStartMs: region.startMs, durationMs: region.durationMs, events: notes }] });
    renderLooper(); projectChanged(); onOpenLooper();
  }

  function addAudioClip(stem, range) {
    const startMs = Math.max(0, Number(addAt.value) * 1000 || 0);
    let track = loop.tracks.find((item) => item.kind === 'audio' && item.assetId === stem.assetId);
    if (!track) {
      track = { id: makeId('track'), name: stem.name, kind: 'audio', assetId: stem.assetId,
        gain: 1, muted: false, solo: false, clips: [] };
      loop.tracks.push(track);
    }
    track.clips.push({ id: makeId('clip'), name: stem.name, assetId: stem.assetId,
      startMs, sourceStartMs: range.startMs, durationMs: range.durationMs });
    renderLooper(); projectChanged();
  }

  function createAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) throw new Error('Este navegador no ofrece Web Audio para la loopera.');
    audioContext = new AudioContextType(); masterGain = audioContext.createGain(); masterGain.gain.value = loop.masterGain;
    masterCompressor = audioContext.createDynamicsCompressor();
    masterCompressor.threshold.value = -8; masterCompressor.knee.value = 8; masterCompressor.ratio.value = 4;
    masterCompressor.attack.value = .004; masterCompressor.release.value = .18;
    masterGain.connect(masterCompressor); masterCompressor.connect(audioContext.destination); return audioContext;
  }

  async function getBuffer(assetId) {
    if (bufferCache.has(assetId)) return bufferCache.get(assetId);
    const blob = blobCache.get(assetId) || (await getAsset(assetId))?.blob;
    if (!blob) throw new Error(`No se encontró el audio ${assetId}.`);
    blobCache.set(assetId, blob);
    const ctx = createAudioContext();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    bufferCache.set(assetId, buffer); return buffer;
  }

  function gainForTrack(track) {
    if (!trackGains.has(track.id)) {
      const gain = audioContext.createGain();
      if (audioContext.createStereoPanner) {
        const panner = audioContext.createStereoPanner(); panner.pan.value = Number(track.pan) || 0;
        gain.connect(panner); panner.connect(masterGain); trackPanners.set(track.id, panner);
      } else gain.connect(masterGain);
      trackGains.set(track.id, gain);
    }
    const gain = trackGains.get(track.id);
    const anySolo = loop.tracks.some((item) => item.solo);
    gain.gain.setTargetAtTime(track.muted || (anySolo && !track.solo) ? 0 : Math.max(0, Math.min(1.5, Number(track.gain) || 0)), audioContext.currentTime, .025);
    const panner = trackPanners.get(track.id);
    if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, Number(track.pan) || 0)), audioContext.currentTime, .025);
    return gain;
  }

  function stopScheduled() {
    const now = audioContext?.currentTime || 0;
    for (const source of liveSources) {
      try {
        if (source.gain?.gain) { source.gain.gain.cancelScheduledValues(now); source.gain.gain.setTargetAtTime(.0001, now, .008); }
        source.node.stop(now + .035);
      } catch { /* ya había terminado */ }
    }
    liveSources.clear();
  }

  function songPositionNow() {
    if (!playbackClock) return playbackPositionMs;
    const linear = playbackClock.startMs + (performance.now() - playbackClock.startedAt) * playbackRate;
    if (loop.loopEnabled && loop.loopEndMs > loop.loopStartMs && linear >= loop.loopEndMs) {
      return loop.loopStartMs + ((linear - loop.loopEndMs) % (loop.loopEndMs - loop.loopStartMs));
    }
    return Math.min(timelineDuration(), linear);
  }

  function loopCycleAt(positionMs) {
    if (!loop.loopEnabled || loop.loopEndMs <= loop.loopStartMs) return 0;
    const from = playbackClock?.startMs || 0;
    const elapsedMs = (performance.now() - (playbackClock?.startedAt || performance.now())) * playbackRate;
    return Math.max(0, Math.floor((from + elapsedMs - loop.loopEndMs) / (loop.loopEndMs - loop.loopStartMs)) + 1);
  }

  function scheduleMidiNote(track, event, startMs, durationMs, when, uniqueKey) {
    if (scheduled.has(uniqueKey) || durationMs <= 0) return;
    scheduled.add(uniqueKey);
    const ctx = audioContext, gain = ctx.createGain(), oscillator = ctx.createOscillator();
    const midiGain = gainForTrack(track);
    oscillator.type = ({ piano: 'triangle', sine: 'sine', square: 'square' })[track.instrument] || 'sawtooth';
    oscillator.frequency.setValueAtTime(440 * 2 ** ((event.midi - 69) / 12), when);
    gain.gain.setValueAtTime(.0001, when);
    const velocity = Math.max(.1, Math.min(1, event.velocity || .7));
    gain.gain.linearRampToValueAtTime(.32 * velocity, when + .012);
    const endAt = when + durationMs / 1000 / playbackRate;
    const releaseAt = Math.max(when + .013, endAt - .035);
    gain.gain.setValueAtTime(.32 * velocity, releaseAt);
    gain.gain.linearRampToValueAtTime(.0001, endAt);
    oscillator.connect(gain); gain.connect(midiGain);
    oscillator.start(when); oscillator.stop(endAt + .02);
    const ref = { node: oscillator, gain }; liveSources.add(ref);
    oscillator.addEventListener('ended', () => liveSources.delete(ref), { once: true });
  }

  function scheduleRange(startMs, endMs, baseWhen, cycle) {
    const rangeEnd = loop.loopEnabled && loop.loopEndMs > loop.loopStartMs ? Math.min(endMs, loop.loopEndMs) : endMs;
    if (rangeEnd <= startMs) return;
    for (const track of loop.tracks) {
      const trackGain = gainForTrack(track);
      if (track.kind === 'audio') {
        for (const clip of track.clips || []) {
          const clipStart = Number(clip.startMs) || 0, clipEnd = clipStart + Math.max(0, Number(clip.durationMs) || 0);
          const start = Math.max(startMs, clipStart), overlapEnd = Math.min(rangeEnd, clipEnd);
          const loopBoundary = loop.loopEnabled && loop.loopEndMs > loop.loopStartMs ? loop.loopEndMs : timelineDuration();
          const end = Math.min(clipEnd, loopBoundary);
          const key = `a:${cycle}:${clip.id}`;
          if (overlapEnd <= start || end <= start || scheduled.has(key)) continue;
          const assetId = clip.assetId || track.assetId;
          if (!assetId) continue;
          getBuffer(assetId).then((buffer) => {
            if (!playbackClock || scheduled.has(key)) return;
            scheduled.add(key);
            const source = audioContext.createBufferSource(); source.buffer = buffer;
            source.connect(trackGain);
            const takeRate = Math.max(.25, Math.min(4, Number(clip.captureRate) || 1));
            const sourceOffset = ((Number(clip.sourceStartMs) || 0) + (start - clipStart) * takeRate) / 1000;
            const clipSeconds = (end - start) / 1000 * takeRate;
            const when = baseWhen + Math.max(0, (start - startMs) / 1000 / playbackRate);
            if (sourceOffset < buffer.duration && clipSeconds > 0) {
              source.playbackRate.value = playbackRate * takeRate;
              source.start(when, sourceOffset, Math.min(clipSeconds, buffer.duration - sourceOffset));
              const ref = { node: source }; liveSources.add(ref);
              source.addEventListener('ended', () => liveSources.delete(ref), { once: true });
            }
          }).catch((error) => { loopStatus.textContent = error.message || 'No se pudo decodificar una pista.'; });
        }
      } else {
        for (const clip of track.clips || []) {
          const clipStart = Number(clip.startMs) || 0, clipEnd = clipStart + (Number(clip.durationMs) || 0);
          const visibleStart = Math.max(startMs, clipStart), visibleEnd = Math.min(rangeEnd, clipEnd);
          if (visibleEnd <= visibleStart) continue;
          (clip.events || []).forEach((event, index) => {
            const noteStart = clipStart + event.startMs, noteEnd = Math.min(clipEnd, clipStart + event.endMs);
            const start = Math.max(visibleStart, noteStart), end = Math.min(visibleEnd, noteEnd);
            const key = `m:${cycle}:${clip.id}:${index}`;
            if (end <= start || scheduled.has(key)) return;
            const when = baseWhen + Math.max(0, (start - startMs) / 1000 / playbackRate);
            scheduleMidiNote(track, event, start, end - start, when, key);
          });
        }
      }
    }
  }

  function scheduleAhead() {
    if (!playbackClock || !audioContext) return;
    const position = songPositionNow(), now = audioContext.currentTime;
    let remaining = .16 * playbackRate, cursor = position, cycle = loopCycleAt(position), offset = 0;
    for (let pass = 0; pass < 3 && remaining > 0; pass++) {
      const boundary = loop.loopEnabled && loop.loopEndMs > loop.loopStartMs ? loop.loopEndMs : timelineDuration();
      const available = Math.max(0, boundary - cursor);
      const part = Math.min(remaining, available);
      if (part > 0) scheduleRange(cursor, cursor + part, now + offset, cycle);
      remaining -= part; offset += part / playbackRate;
      if (remaining <= 0 || boundary === timelineDuration()) break;
      cursor = loop.loopStartMs; cycle++;
    }
    if (scheduled.size > 50000) scheduled = new Set([...scheduled].slice(-20000));
  }

  function timelineDuration() {
    const furthestClip = loop.tracks.flatMap((track) => track.clips || [])
      .reduce((max, clip) => Math.max(max, (Number(clip.startMs) || 0) + (Number(clip.durationMs) || 0)), 30000);
    return Math.max(1000, Number(getAnalysis()?.durationMs) || 0, loop.loopEndMs || 0, furthestClip);
  }

  async function exportMix() {
    if (exportButton.disabled) return;
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) { loopStatus.textContent = 'Este navegador no permite renderizar la mezcla WAV.'; return; }
    const lastClipEnd = loop.tracks.flatMap((track) => track.clips || [])
      .reduce((max, clip) => Math.max(max, (Number(clip.startMs) || 0) + (Number(clip.durationMs) || 0)), 0);
    const durationMs = Math.max(1000, Number(getAnalysis()?.durationMs) || 0, lastClipEnd, loop.loopEnabled ? loop.loopEndMs : 0);
    if (durationMs > 20 * 60 * 1000) { loopStatus.textContent = 'La mezcla supera 20 minutos; acorta la sesión antes de exportarla para evitar agotar la memoria.'; return; }
    exportButton.disabled = true; exportButton.textContent = 'Renderizando WAV…';
    loopStatus.textContent = `Renderizando la mezcla completa (${timeLabel(durationMs)}) una vez, según las pistas y controles de volumen…`;
    try {
      const sampleRate = 44100, frameCount = Math.ceil(durationMs / 1000 * sampleRate);
      const offline = new OfflineContext(2, frameCount, sampleRate);
      const master = offline.createGain(); master.gain.value = loop.masterGain;
      const compressor = offline.createDynamicsCompressor();
      compressor.threshold.value = -8; compressor.knee.value = 8; compressor.ratio.value = 4;
      compressor.attack.value = .004; compressor.release.value = .18;
      master.connect(compressor); compressor.connect(offline.destination);
      const anySolo = loop.tracks.some((track) => track.solo);
      for (const track of loop.tracks) {
        const trackGain = offline.createGain();
        trackGain.gain.value = track.muted || (anySolo && !track.solo) ? 0 : Math.max(0, Math.min(1.5, Number(track.gain ?? 1)));
        if (offline.createStereoPanner) {
          const panner = offline.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, Number(track.pan) || 0));
          trackGain.connect(panner); panner.connect(master);
        } else trackGain.connect(master);

        if (track.kind === 'audio') {
          for (const clip of track.clips || []) {
            const assetId = clip.assetId || track.assetId;
            if (!assetId || Number(clip.durationMs) <= 0) continue;
            const buffer = await getBuffer(assetId);
            const rate = Math.max(.25, Math.min(4, Number(clip.captureRate) || 1));
            const sourceOffset = Math.max(0, Number(clip.sourceStartMs) || 0) / 1000;
            const sourceDuration = Math.min((Number(clip.durationMs) || 0) / 1000 * rate, buffer.duration - sourceOffset);
            const start = Math.max(0, Number(clip.startMs) || 0) / 1000;
            if (sourceDuration <= 0 || sourceOffset >= buffer.duration || start >= durationMs / 1000) continue;
            const source = offline.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
            source.connect(trackGain);
            source.start(start, sourceOffset, Math.min(sourceDuration, durationMs / 1000 * rate));
          }
        } else {
          for (const clip of track.clips || []) for (const event of clip.events || []) {
            const start = Math.max(0, ((Number(clip.startMs) || 0) + (Number(event.startMs) || 0)) / 1000);
            const end = Math.min(durationMs / 1000, ((Number(clip.startMs) || 0) + (Number(event.endMs) || 0)) / 1000);
            const length = end - start;
            if (length <= .006 || start >= durationMs / 1000) continue;
            const oscillator = offline.createOscillator(), envelope = offline.createGain();
            oscillator.type = ({ piano: 'triangle', sine: 'sine', square: 'square' })[track.instrument] || 'sawtooth';
            oscillator.frequency.setValueAtTime(440 * 2 ** ((Number(event.midi) - 69) / 12), start);
            const peak = .32 * Math.max(.1, Math.min(1, Number(event.velocity) || .7));
            const attack = Math.min(.012, length / 3), release = Math.min(.035, length / 3);
            envelope.gain.setValueAtTime(.0001, start);
            envelope.gain.linearRampToValueAtTime(peak, start + attack);
            envelope.gain.setValueAtTime(peak, Math.max(start + attack, end - release));
            envelope.gain.linearRampToValueAtTime(.0001, end);
            oscillator.connect(envelope); envelope.connect(trackGain);
            oscillator.start(start); oscillator.stop(end + .02);
          }
        }
      }
      const rendered = await offline.startRendering();
      const wav = audioBufferToWav(rendered), url = URL.createObjectURL(wav), anchor = element('a');
      anchor.href = url; anchor.download = 'loopera-mezcla.wav'; anchor.style.display = 'none';
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      loopStatus.textContent = `Mezcla exportada como WAV · ${timeLabel(durationMs)} · ${Math.ceil(wav.size / 1024 / 1024)} MB.`;
    } catch (error) {
      loopStatus.textContent = `No se pudo exportar la mezcla: ${error?.message || error}`;
    } finally {
      exportButton.disabled = false; exportButton.textContent = '⇩ Exportar mezcla WAV';
    }
  }

  function startRecordingMeter(stream) {
    try {
      const source = createAudioContext().createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .2;
      const sink = audioContext.createGain(); sink.gain.value = 0;
      source.connect(analyser); analyser.connect(sink); sink.connect(audioContext.destination);
      recordingInputSource = source; recordingAnalyser = analyser; recordingMeterSink = sink;
      recordingSamples = new Float32Array(analyser.fftSize);
    } catch {
      recordingInputSource = null; recordingAnalyser = null; recordingSamples = null;
    }
  }

  function stopRecordingMeter() {
    try { recordingInputSource?.disconnect(); } catch { /* ya estaba desconectado */ }
    try { recordingAnalyser?.disconnect(); } catch { /* ya estaba desconectado */ }
    try { recordingMeterSink?.disconnect(); } catch { /* ya estaba desconectado */ }
    recordingInputSource = null; recordingAnalyser = null; recordingMeterSink = null; recordingSamples = null;
  }

  function recordingInputLevel() {
    if (!recordingAnalyser || !recordingSamples) return 'nivel no disponible';
    try {
      recordingAnalyser.getFloatTimeDomainData(recordingSamples);
      let energy = 0;
      for (const sample of recordingSamples) energy += sample * sample;
      const rms = Math.sqrt(energy / recordingSamples.length);
      if (rms < .001) return 'sin señal de entrada';
      return `entrada ${Math.round(20 * Math.log10(rms))} dBFS`;
    } catch { return 'nivel no disponible'; }
  }

  function recordingErrorMessage(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'El navegador bloqueó el micrófono. Permite el acceso al micrófono para localhost y vuelve a grabar.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se encontró un micrófono conectado o habilitado.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'El micrófono está ocupado o Windows no pudo abrirlo. Cierra otras apps que lo estén usando e intenta de nuevo.';
    if (name === 'OverconstrainedError') return 'El micrófono no admite la configuración solicitada. Revisa el dispositivo de entrada.';
    return error?.message || 'No se pudo iniciar la grabación.';
  }

  function updateRecordingTake() {
    if (pendingTake && mediaRecorder?.state === 'recording') {
      const now = performance.now();
      if (lastRecordingTick) recordingSongProgressMs += Math.max(0, now - lastRecordingTick) * playbackRate;
      lastRecordingTick = now;
      pendingTake.clip.durationMs = Math.max(40, recordingSongProgressMs);
      const block = timeline.querySelector(`[data-clip-id="${pendingTake.clip.id}"]`);
      if (recordingTargetMs) {
        const boundedProgress = Math.min(recordingSongProgressMs, recordingTargetMs);
        const slice = loopRecordingSlice({ elapsedSongMs: boundedProgress, recordStartMs: loop.loopStartMs,
          loopStartMs: loop.loopStartMs, loopEndMs: loop.loopEndMs, playbackRate, loopEnabled: loop.loopEnabled });
        Object.assign(pendingTake.clip, slice);
        pendingTake.clip.durationMs = Math.min(recordingTargetMs, pendingTake.clip.durationMs);
        if (block) {
          block.style.left = `${pendingTake.clip.startMs / Math.max(1, timelineDuration()) * 100}%`;
          block.style.width = `${Math.max(.8, pendingTake.clip.durationMs / Math.max(1, timelineDuration()) * 100)}%`;
          block.textContent = `Grabando · ${timeLabel(slice.durationMs)}`;
        }
        if (now - lastRecordingStatusAt > 500) {
          loopStatus.textContent = `Grabando vuelta única · ${timeLabel(pendingTake.clip.durationMs)} / ${timeLabel(recordingTargetMs)} · ${recordingInputLevel()}`;
          lastRecordingStatusAt = now;
        }
        if (recordingSongProgressMs >= recordingTargetMs) {
          pendingTake.clip.durationMs = recordingTargetMs;
          stopRecording({ flush: false, reason: 'loop' });
          return;
        }
      } else {
        const slice = loopRecordingSlice({ elapsedSongMs: recordingSongProgressMs, recordStartMs: recordStartedSongMs,
          playbackRate, loopEnabled: false });
        Object.assign(pendingTake.clip, slice);
        if (block) { block.style.width = `${Math.max(.8, pendingTake.clip.durationMs / Math.max(1, timelineDuration()) * 100)}%`; block.textContent = `Grabando · ${timeLabel(slice.durationMs)}`; }
        if (now - lastRecordingStatusAt > 500) {
          loopStatus.textContent = `Grabando ${timeLabel(recordingSongProgressMs)} · ${recordingInputLevel()}`;
          lastRecordingStatusAt = now;
        }
      }
    }
  }

  function updatePlayhead() {
    playbackPositionMs = songPositionNow(); loop.positionMs = playbackPositionMs;
    if (playbackClock && !loop.loopEnabled && playbackPositionMs >= timelineDuration()) {
      playbackPositionMs = timelineDuration(); loop.positionMs = playbackPositionMs;
      pauseLooper(); loopStatus.textContent = 'Fin de la sesión. La toma en modo manual sigue abierta; pulsa Guardar toma para finalizar.'; return;
    }
    const position = `${timeLabel(playbackPositionMs)} · ${loop.tracks.length} pistas`;
    loopPosition.textContent = position;
    const marker = timeline.querySelector('.loop-playhead');
    if (marker) marker.style.left = `${trackControlWidth + playbackPositionMs / Math.max(1, timelineDuration()) * timelineWidth()}px`;
    updateRecordingTake();
    scheduleAhead();
  }

  async function playLooper() {
    if (playbackClock) return;
    try {
      const ctx = createAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const assetIds = [...new Set(loop.tracks.filter((track) => track.kind === 'audio')
        .flatMap((track) => (track.clips || []).map((clip) => clip.assetId || track.assetId)).filter(Boolean))];
      if (assetIds.length) {
        loopStatus.textContent = 'Preparando las pistas de audio…';
        await Promise.all(assetIds.map((assetId) => getBuffer(assetId)));
      }
      if (loop.loopEnabled && playbackPositionMs >= loop.loopEndMs) playbackPositionMs = loop.loopStartMs;
      else if (!loop.loopEnabled && playbackPositionMs >= timelineDuration()) playbackPositionMs = 0;
      scheduled = new Set();
      playbackClock = { startMs: playbackPositionMs, startedAt: performance.now() };
      if (mediaRecorder?.state === 'paused') {
        mediaRecorder.resume();
        lastRecordingTick = performance.now();
      }
      loopStatus.textContent = 'Loopera reproduciendo pistas sincronizadas.';
      playControl.disabled = true; pauseControl.disabled = false; stopControl.disabled = false;
      scheduleAhead(); playbackTimer = setInterval(updatePlayhead, 35);
    } catch (error) { loopStatus.textContent = error.message || 'No se pudo iniciar la loopera.'; playbackClock = null; }
  }

  function pauseLooper() {
    if (playbackClock) {
      playbackPositionMs = songPositionNow();
      updateRecordingTake();
    }
    if (mediaRecorder?.state === 'recording') mediaRecorder.pause();
    lastRecordingTick = 0;
    playbackClock = null;
    if (playbackTimer) clearInterval(playbackTimer); playbackTimer = null;
    stopScheduled(); loop.positionMs = playbackPositionMs;
    playControl.disabled = false; pauseControl.disabled = true; stopControl.disabled = false;
    loopStatus.textContent = `Pausa · ${timeLabel(playbackPositionMs)}.`; updatePlayhead(); projectChanged();
  }

  function stopLooper() {
    pauseLooper(); playbackPositionMs = loop.loopEnabled ? loop.loopStartMs : 0; loop.positionMs = playbackPositionMs;
    loopStatus.textContent = 'Loopera detenida.'; updatePlayhead();
  }

  const trackControlWidth = 250;
  function timelineWidth() { return Math.max(980, Math.ceil(timelineDuration() / 1000 * loop.zoom)); }
  function snapDurationMs() {
    const beat = 60000 / Math.max(20, Number(loop.bpm) || 120);
    return ({ bar: beat * 4, beat, eighth: beat / 2, sixteenth: beat / 4, off: 0 })[loop.snap] ?? beat;
  }

  function drawClipWaveform(canvas, clip, assetId) {
    if (!looperPanel.isConnected || looperPanel.hidden || !assetId) return;
    getBuffer(assetId).then((buffer) => requestAnimationFrame(() => {
      if (!canvas.isConnected) return;
      const width = Math.max(24, Math.floor(canvas.clientWidth)), height = Math.max(20, Math.floor(canvas.clientHeight));
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d'); if (!context) return;
      context.scale(scale, scale); context.clearRect(0, 0, width, height);
      const samples = buffer.getChannelData(0);
      const start = Math.max(0, Math.floor((Number(clip.sourceStartMs) || 0) / 1000 * buffer.sampleRate));
      const captureRate = Math.max(.25, Math.min(4, Number(clip.captureRate) || 1));
      const end = Math.min(samples.length, start + Math.ceil((Number(clip.durationMs) || 0) / 1000 * captureRate * buffer.sampleRate));
      const columns = Math.max(1, Math.floor(width / 2));
      context.strokeStyle = '#7de0c9'; context.globalAlpha = .75; context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x < columns; x++) {
        const from = start + Math.floor(x / columns * Math.max(1, end - start));
        const to = Math.min(end, Math.max(from + 1, start + Math.floor((x + 1) / columns * Math.max(1, end - start))));
        let low = 1, high = -1;
        for (let i = from; i < to; i += Math.max(1, Math.floor((to - from) / 80))) { low = Math.min(low, samples[i]); high = Math.max(high, samples[i]); }
        const px = x * 2, mid = height / 2;
        context.moveTo(px, mid - Math.max(1, high * mid * .85)); context.lineTo(px, mid - Math.min(-1, low * mid * .85));
      }
      context.stroke();
    })).catch(() => {});
  }

  function renderLooper() {
    const width = timelineWidth(), duration = timelineDuration();
    const scrollLeft = loopRows.scrollLeft;
    timeline.replaceChildren(); timeline.style.width = `${trackControlWidth + width}px`;
    timeline.style.setProperty('--timeline-width', `${width}px`);
    timeline.style.setProperty('--control-width', `${trackControlWidth}px`);
    const ruler = element('div', 'loop-ruler'); ruler.style.width = `${width}px`;
    ruler.style.marginLeft = `${trackControlWidth}px`;
    const barMs = 60000 / Math.max(20, Number(loop.bpm) || 120) * 4;
    timeline.style.setProperty('--bar-width', `${barMs / 1000 * loop.zoom}px`);
    for (let at = 0, bar = 1; at <= duration; at += barMs, bar++) {
      const marker = element('span', 'loop-ruler-mark', `C${bar}`); marker.style.left = `${at / duration * 100}%`; ruler.append(marker);
    }
    ruler.addEventListener('click', (event) => {
      const rect = ruler.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const wasPlaying = Boolean(playbackClock);
      if (wasPlaying) pauseLooper();
      playbackPositionMs = ratio * duration; loop.positionMs = playbackPositionMs;
      if (wasPlaying) playLooper(); else updatePlayhead();
    });
    timeline.append(ruler);
    if (!loop.tracks.length) timeline.append(element('p', 'multi-empty', 'Agrega una pista de audio, MIDI o una grabación para armar la sesión.'));
    for (const track of loop.tracks) {
      const row = element('div', `loop-track-row is-${track.kind}`); row.dataset.trackId = track.id;
      const controls = element('div', 'loop-track-controls');
      const trackHead = element('div', 'loop-track-head');
      const name = element('strong', '', track.name);
      const mute = element('label', 'loop-mini-toggle'); const muteInput = element('input'); muteInput.type = 'checkbox'; muteInput.checked = Boolean(track.muted);
      mute.append(muteInput, element('span', '', 'M')); muteInput.addEventListener('change', () => { track.muted = muteInput.checked; projectChanged(); });
      const solo = element('label', 'loop-mini-toggle'); const soloInput = element('input'); soloInput.type = 'checkbox'; soloInput.checked = Boolean(track.solo);
      solo.append(soloInput, element('span', '', 'S')); soloInput.addEventListener('change', () => { track.solo = soloInput.checked; projectChanged(); });
      const gain = element('input', 'loop-track-gain'); gain.type = 'range'; gain.min = '0'; gain.max = '1.5'; gain.step = '.05'; gain.value = String(track.gain ?? 1); gain.title = 'Volumen de pista';
      gain.addEventListener('input', () => { track.gain = Number(gain.value); if (trackGains.has(track.id) && audioContext) gainForTrack(track); projectChanged(); });
      const pan = element('input', 'loop-track-pan'); pan.type = 'range'; pan.min = '-1'; pan.max = '1'; pan.step = '.05'; pan.value = String(track.pan ?? 0); pan.title = 'Panorama estéreo'; pan.setAttribute('aria-label', `Panorama de ${track.name}`);
      pan.addEventListener('input', () => { track.pan = Number(pan.value); if (trackGains.has(track.id) && audioContext) gainForTrack(track); projectChanged(); });
      const remove = element('button', 'loop-remove-track', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Quitar pista ${track.name}`);
      remove.addEventListener('click', () => {
        if (pendingTake?.track === track && ['recording', 'paused'].includes(mediaRecorder?.state)) stopRecording();
        loop.tracks = loop.tracks.filter((item) => item !== track); trackGains.get(track.id)?.disconnect(); trackPanners.get(track.id)?.disconnect(); trackGains.delete(track.id); trackPanners.delete(track.id); renderLooper(); projectChanged();
      });
      trackHead.append(name);
      if (track.kind === 'midi') {
        const instrument = element('select', 'loop-instrument'); instrument.setAttribute('aria-label', `Timbre sintético de ${track.name}`);
        for (const [value, label] of [['guitar', 'Guitarra*'], ['piano', 'Piano*'], ['sine', 'Seno'], ['square', 'Cuadrada']]) instrument.add(new Option(label, value));
        instrument.value = track.instrument || 'guitar';
        instrument.addEventListener('change', () => { track.instrument = instrument.value; projectChanged(); });
        trackHead.append(instrument);
      }
      trackHead.append(remove);
      const mixer = element('div', 'loop-track-mixer');
      mixer.append(mute, solo, element('span', 'loop-fader-label', 'Vol'), gain,
        element('span', 'loop-fader-label', 'Pan'), pan);
      controls.append(trackHead, mixer);
      const lane = element('div', 'loop-lane'); lane.style.width = `${width}px`; lane.dataset.trackId = track.id;
      lane.addEventListener('dragover', (event) => event.preventDefault());
      lane.addEventListener('drop', (event) => {
        event.preventDefault();
        const clipId = event.dataTransfer.getData('text/loop-clip');
        const source = loop.tracks.flatMap((item) => (item.clips || []).map((clip) => ({ track: item, clip }))).find((item) => item.clip.id === clipId);
        if (!source) return;
        const rect = lane.getBoundingClientRect(), ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const grabOffsetMs = Number(event.dataTransfer.getData('text/loop-offset-ms')) || 0;
        const desiredStart = Math.max(0, ratio * duration - grabOffsetMs);
        const snapMs = snapDurationMs();
        source.clip.startMs = snapMs ? Math.round(desiredStart / snapMs) * snapMs : desiredStart;
        if (source.track !== track && source.track.kind === track.kind) {
          source.track.clips = source.track.clips.filter((clip) => clip !== source.clip); track.clips.push(source.clip);
        }
        renderLooper(); projectChanged();
      });
      for (const clip of track.clips || []) {
        const block = element('div', `loop-clip ${track.kind === 'midi' ? 'is-midi' : ''}${!clip.assetId && track.kind === 'audio' ? ' is-recording' : ''}`);
        const clipLabel = element('span', 'loop-clip-label', clip.name || track.name);
        if (track.kind === 'audio' && clip.assetId) {
          const waveformCanvas = element('canvas', 'loop-clip-waveform');
          waveformCanvas.setAttribute('aria-label', 'Forma de onda; haz clic para ubicar el cursor y cortar el clip');
          waveformCanvas.title = 'Clic: coloca el cursor · arrastra los bordes: recorta · luego usa Cortar en cursor';
          waveformCanvas.addEventListener('click', (event) => {
            event.stopPropagation();
            selectedClipRef = { trackId: track.id, clipId: clip.id };
            lane.querySelectorAll('.loop-clip.is-selected').forEach((item) => item.classList.remove('is-selected'));
            block.classList.add('is-selected'); updateClipInspector();
            if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') {
              loopStatus.textContent = 'Detén la toma para mover el cursor y editar este audio.'; return;
            }
            const rect = waveformCanvas.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
            const wasPlaying = Boolean(playbackClock);
            if (wasPlaying) pauseLooper();
            playbackPositionMs = (Number(clip.startMs) || 0) + ratio * (Number(clip.durationMs) || 0);
            loop.positionMs = playbackPositionMs;
            if (wasPlaying) playLooper(); else updatePlayhead();
            projectChanged();
          });
          block.append(waveformCanvas);
          drawClipWaveform(waveformCanvas, clip, clip.assetId || track.assetId);
          for (const edge of ['left', 'right']) {
            const handle = element('span', `loop-clip-trim-handle is-${edge}`);
            handle.setAttribute('role', 'slider'); handle.setAttribute('aria-label', `${edge === 'left' ? 'Recortar inicio' : 'Recortar final'} de ${clip.name || track.name}`);
            handle.title = edge === 'left' ? 'Arrastra para recortar el inicio' : 'Arrastra para recortar el final';
            handle.addEventListener('pointerdown', (event) => {
              event.preventDefault(); event.stopPropagation();
              selectedClipRef = { trackId: track.id, clipId: clip.id };
              lane.querySelectorAll('.loop-clip.is-selected').forEach((item) => item.classList.remove('is-selected'));
              block.classList.add('is-selected'); updateClipInspector();
              resizingClip = { clip, original: { ...clip }, edge, startX: event.clientX, block, canvas: waveformCanvas,
                timelineDuration: duration, timelineWidth: width, sourceDurationMs: bufferCache.get(clip.assetId || track.assetId)?.duration * 1000 };
              const move = (moveEvent) => {
                if (!resizingClip) return;
                const edit = resizingClip;
                const deltaMs = (moveEvent.clientX - edit.startX) * edit.timelineDuration / Math.max(1, edit.timelineWidth);
                Object.assign(edit.clip, resizeAudioClip(edit.original, edit.edge, deltaMs,
                  { sourceDurationMs: Number.isFinite(edit.sourceDurationMs) ? edit.sourceDurationMs : Infinity }));
                edit.block.style.left = `${Math.max(0, edit.clip.startMs / edit.timelineDuration * 100)}%`;
                edit.block.style.width = `${Math.max(2.5, edit.clip.durationMs / edit.timelineDuration * 100)}%`;
                clipStartInput.value = (edit.clip.startMs / 1000).toFixed(2);
                clipSourceInput.value = ((Number(edit.clip.sourceStartMs) || 0) / 1000).toFixed(2);
                clipLengthInput.value = (edit.clip.durationMs / 1000).toFixed(2);
                drawClipWaveform(edit.canvas, edit.clip, edit.clip.assetId || track.assetId);
              };
              const finish = () => {
                window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish);
                if (!resizingClip) return;
                const finished = resizingClip; resizingClip = null;
                if (Math.abs(finished.clip.startMs - finished.original.startMs) > .5 || Math.abs(finished.clip.durationMs - finished.original.durationMs) > .5) {
                  loopStatus.textContent = `Recorte aplicado · ${timeLabel(finished.clip.startMs)} a ${timeLabel(finished.clip.startMs + finished.clip.durationMs)}.`;
                  projectChanged(); renderLooper();
                }
              };
              window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
            });
            block.append(handle);
          }
        } else if (track.kind === 'midi' && clip.events?.length) {
          const events = clip.events.slice(0, 500), minMidi = Math.min(...events.map((note) => note.midi)), maxMidi = Math.max(...events.map((note) => note.midi));
          for (const note of events) {
            const noteBlock = element('span', 'loop-midi-note');
            noteBlock.style.left = `${Math.max(0, note.startMs / Math.max(1, clip.durationMs) * 100)}%`;
            noteBlock.style.width = `${Math.max(.4, (note.endMs - note.startMs) / Math.max(1, clip.durationMs) * 100)}%`;
            noteBlock.style.top = `${maxMidi === minMidi ? 45 : 90 - (note.midi - minMidi) / (maxMidi - minMidi) * 84}%`;
            block.append(noteBlock);
          }
        }
        block.append(clipLabel);
        block.draggable = true; block.title = `Inicio ${timeLabel(clip.startMs)} · duración ${timeLabel(clip.durationMs)} · arrastra para mover`;
        block.style.left = `${Math.max(0, clip.startMs / duration * 100)}%`;
        block.style.width = `${Math.max(2.5, clip.durationMs / duration * 100)}%`;
        block.dataset.clipId = clip.id;
        if (selectedClipRef?.trackId === track.id && selectedClipRef.clipId === clip.id) block.classList.add('is-selected');
        block.addEventListener('click', () => {
          lane.querySelectorAll('.loop-clip.is-selected').forEach((item) => item.classList.remove('is-selected'));
          block.classList.add('is-selected');
          selectedClipRef = { trackId: track.id, clipId: clip.id };
          updateClipInspector();
        });
        block.addEventListener('dragstart', (event) => {
          if (event.target.closest('.loop-clip-trim-handle')) { event.preventDefault(); return; }
          if (!clip.assetId && track.kind === 'audio') { event.preventDefault(); return; }
          event.dataTransfer.setData('text/loop-clip', clip.id);
          const rect = block.getBoundingClientRect();
          const ratioInClip = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
          event.dataTransfer.setData('text/loop-offset-ms', String(ratioInClip * clip.durationMs));
        });
        lane.append(block);
      }
      row.append(controls, lane); timeline.append(row);
    }
    const marker = element('span', 'loop-playhead'); marker.style.left = `${trackControlWidth + playbackPositionMs / duration * width}px`; timeline.append(marker);
    loopRows.replaceChildren(timeline);
    loopRows.scrollLeft = scrollLeft;
    updateClipInspector();
    updatePlayhead();
  }

  async function addMidiFile(file) {
    const parsed = parseMidiFile(await file.arrayBuffer());
    for (const track of parsed) {
      const endMs = Math.max(100, ...track.events.map((event) => event.endMs));
      loop.tracks.push({ id: makeId('track'), name: parsed.length > 1 ? `${file.name} · ${track.index}` : file.name,
        kind: 'midi', instrument: 'guitar', gain: 1, muted: false, solo: false,
        clips: [{ id: makeId('clip'), name: 'Secuencia MIDI', startMs: Number(addAt.value) * 1000 || 0,
          sourceStartMs: 0, durationMs: endMs, events: track.events.map((event) => ({ midi: event.midi,
            startMs: event.startMs, endMs: event.endMs, velocity: event.velocity })) }] });
    }
    renderLooper(); projectChanged();
  }

  const loopHeading = element('header', 'multi-screen-heading');
  loopHeading.append(element('div', '', 'Loopera'), element('p', '', 'Combina tramos originales, pistas separadas, notas MIDI y tomas de micrófono sobre un único transporte.'));
  looperPanel.append(loopHeading);
  const loopTransport = element('section', 'multi-card loop-transport');
  const playControl = element('button', 'multi-button is-primary', '▶ Reproducir'); playControl.type = 'button'; playControl.addEventListener('click', playLooper);
  const pauseControl = element('button', 'multi-button', 'Ⅱ Pausar'); pauseControl.type = 'button'; pauseControl.disabled = true; pauseControl.addEventListener('click', pauseLooper);
  const stopControl = element('button', 'multi-button', '■ Detener'); stopControl.type = 'button'; stopControl.disabled = true; stopControl.addEventListener('click', stopLooper);
  const loopPosition = element('output', 'loop-position', '0:00.0');
  const loopStatus = element('p', 'multi-status', 'Loop listo · 30 s por defecto. Grabar vuelta crea una pista y se detiene al cerrar A–B.'); loopStatus.setAttribute('role', 'status');
  const loopEnableLabel = element('label', 'multi-toggle'); const loopEnabled = element('input'); loopEnabled.type = 'checkbox'; loopEnabled.checked = Boolean(loop.loopEnabled);
  loopEnableLabel.append(loopEnabled, element('span', '', 'Repetir A–B'));
  const loopAInput = numberInput(loop.loopStartMs / 1000, '.1', 'Inicio A del loop en segundos');
  const loopBInput = numberInput(loop.loopEndMs / 1000, '.1', 'Final B del loop en segundos');
  const currentA = element('button', 'multi-button', 'A = cursor'); currentA.type = 'button'; currentA.addEventListener('click', () => { loop.loopStartMs = Math.min(playbackPositionMs, loop.loopEndMs - 100); loopAInput.value = (loop.loopStartMs / 1000).toFixed(1); projectChanged(); renderLooper(); });
  const currentB = element('button', 'multi-button', 'B = cursor'); currentB.type = 'button'; currentB.addEventListener('click', () => { loop.loopEndMs = Math.max(loop.loopStartMs + 100, playbackPositionMs); loopEndWasAutomatic = false; loopBInput.value = (loop.loopEndMs / 1000).toFixed(1); projectChanged(); renderLooper(); });
  const setLoopLength = (lengthMs) => {
    loop.loopEndMs = loop.loopStartMs + lengthMs; loopEndWasAutomatic = false;
    loopBInput.value = (loop.loopEndMs / 1000).toFixed(1); projectChanged(); renderLooper();
  };
  const loopPreset30 = element('button', 'multi-button', '30 s'); loopPreset30.type = 'button'; loopPreset30.title = 'Definir una vuelta de 30 segundos desde A'; loopPreset30.addEventListener('click', () => setLoopLength(30000));
  const loopPreset60 = element('button', 'multi-button', '1 min'); loopPreset60.type = 'button'; loopPreset60.title = 'Definir una vuelta de un minuto desde A'; loopPreset60.addEventListener('click', () => setLoopLength(60000));
  loopEnabled.addEventListener('change', () => {
    loop.loopEnabled = loopEnabled.checked;
    recordButton.textContent = loop.loopEnabled ? '● Grabar una vuelta' : '● Grabar hasta detener';
    loopRecordHint.textContent = loop.loopEnabled
      ? 'Graba una vuelta completa de A a B. Al llegar a B, la toma se guarda como una pista debajo; vuelve a grabar para sumar otra capa. Clic en la forma de onda para ubicar el cursor, arrastra los bordes para recortar y pulsa «Cortar en cursor» para dividir.'
      : 'Con el loop apagado, la toma sigue hasta que pulses «Guardar toma». Clic en la forma de onda para ubicar el cursor, arrastra los bordes para recortar y pulsa «Cortar en cursor» para dividir.';
    projectChanged();
  });
  loopAInput.addEventListener('change', () => { loop.loopStartMs = Math.max(0, Math.min(loop.loopEndMs - 100, Number(loopAInput.value) * 1000 || 0)); loopAInput.value = (loop.loopStartMs / 1000).toFixed(1); projectChanged(); renderLooper(); });
  loopBInput.addEventListener('change', () => { loop.loopEndMs = Math.max(loop.loopStartMs + 100, Number(loopBInput.value) * 1000 || timelineDuration()); loopEndWasAutomatic = false; loopBInput.value = (loop.loopEndMs / 1000).toFixed(1); projectChanged(); renderLooper(); });
  const bpmInput = numberInput(loop.bpm, '1', 'Tempo de la grilla en pulsos por minuto'); bpmInput.min = '20'; bpmInput.max = '300';
  bpmInput.addEventListener('change', () => { loop.bpm = Math.max(20, Math.min(300, Number(bpmInput.value) || 120)); projectChanged(); renderLooper(); });
  const snapInput = element('select', 'multi-select'); snapInput.setAttribute('aria-label', 'Ajuste a la grilla');
  for (const [value, label] of [['bar', 'Compás'], ['beat', 'Pulso'], ['eighth', '1/8'], ['sixteenth', '1/16'], ['off', 'Libre']]) snapInput.add(new Option(label, value));
  snapInput.value = loop.snap;
  snapInput.addEventListener('change', () => { loop.snap = snapInput.value; projectChanged(); renderLooper(); });
  const zoomLabel = element('label', 'multi-rate-label', 'Zoom');
  const zoomInput = element('input', 'multi-rate'); zoomInput.type = 'range'; zoomInput.min = '6'; zoomInput.max = '36'; zoomInput.step = '2'; zoomInput.value = String(loop.zoom);
  const zoomValue = element('output', 'multi-rate-value', `${loop.zoom} px/s`);
  zoomInput.addEventListener('input', () => { loop.zoom = Number(zoomInput.value); zoomValue.textContent = `${loop.zoom} px/s`; renderLooper(); projectChanged(); });
  const masterLabel = element('label', 'multi-rate-label', 'Master');
  const masterInput = element('input', 'multi-rate'); masterInput.type = 'range'; masterInput.min = '0'; masterInput.max = '1.25'; masterInput.step = '.01'; masterInput.value = String(loop.masterGain); masterInput.setAttribute('aria-label', 'Volumen general');
  const masterValue = element('output', 'multi-rate-value', `${Math.round(loop.masterGain * 100)}%`);
  masterInput.addEventListener('input', () => {
    loop.masterGain = Number(masterInput.value); masterValue.textContent = `${Math.round(loop.masterGain * 100)}%`;
    if (masterGain && audioContext) masterGain.gain.setTargetAtTime(loop.masterGain, audioContext.currentTime, .02);
    projectChanged();
  });
  const rateLabel = element('label', 'multi-rate-label', 'Velocidad');
  const rateInput = element('input', 'multi-rate'); rateInput.type = 'range'; rateInput.min = '.5'; rateInput.max = '1.5'; rateInput.step = '.05'; rateInput.value = String(playbackRate);
  const rateValue = element('output', 'multi-rate-value', '1.00×');
  rateInput.addEventListener('input', () => {
    const position = playbackClock ? songPositionNow() : playbackPositionMs;
    playbackRate = Number(rateInput.value) || 1; rateValue.textContent = `${playbackRate.toFixed(2)}×`;
    if (playbackClock) {
      stopScheduled(); scheduled = new Set(); playbackPositionMs = position;
      playbackClock = { startMs: position, startedAt: performance.now() }; scheduleAhead();
    }
  });
  const playbackGroup = element('div', 'loop-control-group');
  playbackGroup.append(element('span', 'loop-control-title', 'Transporte'), playControl, pauseControl, stopControl, loopPosition);
  const loopRangeGroup = element('div', 'loop-control-group');
  const loopRangeLabel = element('span', 'loop-control-title', 'Vuelta A–B');
  const loopAGroup = element('label', 'multi-inline-label', 'A · seg'); loopAGroup.append(loopAInput);
  const loopBGroup = element('label', 'multi-inline-label', 'B · seg'); loopBGroup.append(loopBInput);
  loopRangeGroup.append(element('span', 'loop-control-title', 'Duración'), loopEnableLabel, loopAGroup, currentA, loopBGroup, currentB, loopPreset30, loopPreset60);
  const timingGroup = element('div', 'loop-control-group');
  const bpmGroup = element('label', 'multi-inline-label', 'BPM'); bpmGroup.append(bpmInput);
  const snapGroup = element('label', 'multi-inline-label', 'Ajuste'); snapGroup.append(snapInput);
  timingGroup.append(element('span', 'loop-control-title', 'Ritmo y edición'), bpmGroup,
    rateLabel, rateInput, rateValue, snapGroup, zoomLabel, zoomInput, zoomValue);
  const masterGroup = element('div', 'loop-control-group');
  masterGroup.append(element('span', 'loop-control-title', 'Mezcla'), masterLabel, masterInput, masterValue);
  loopTransport.append(playbackGroup, loopRangeGroup, timingGroup, masterGroup, loopStatus);
  const midiImportInput = element('input', 'multi-file-input'); midiImportInput.type = 'file'; midiImportInput.accept = '.mid,.midi,audio/midi';
  const midiImportLabel = element('label', 'multi-button', 'Importar MIDI'); midiImportLabel.append(midiImportInput);
  midiImportInput.addEventListener('change', async () => {
    const files = [...(midiImportInput.files || [])];
    for (const file of files) { try { await addMidiFile(file); } catch (error) { loopStatus.textContent = error.message || `No se pudo leer ${file.name}.`; } }
    midiImportInput.value = '';
  });
  const addAt = numberInput(0, '.1', 'Posición de entrada del clip en segundos');
  const addAtLabel = element('label', 'multi-inline-label', 'Colocar en (s)'); addAtLabel.append(addAt);
  const recordButton = element('button', 'multi-button is-primary', '● Grabar micrófono'); recordButton.type = 'button';
  const recordStop = element('button', 'multi-button', '■ Guardar toma'); recordStop.type = 'button'; recordStop.disabled = true;
  recordButton.textContent = loop.loopEnabled ? '● Grabar una vuelta' : '● Grabar hasta detener';
  function lockTakeControls(locked) {
    for (const control of [loopEnabled, loopAInput, loopBInput, currentA, currentB, loopPreset30, loopPreset60, rateInput]) control.disabled = locked;
  }
  let takeNumber = 0;
  async function startRecording() {
    if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused' || recordingStarting || recordButton.disabled) return;
    recordingStarting = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador no permite grabar audio localmente.');
      loopStatus.textContent = 'Solicitando permiso de micrófono…';
      recordedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (loop.loopEnabled && loop.loopEndMs > loop.loopStartMs) {
        if (playbackClock) pauseLooper();
        playbackPositionMs = loop.loopStartMs;
        await playLooper();
      } else if (!playbackClock) {
        if (playbackPositionMs >= timelineDuration()) playbackPositionMs = 0;
        await playLooper();
      }
      if (!playbackClock) throw new Error('No se pudo iniciar el transporte para grabar.');
      recordStartedSongMs = loop.loopEnabled ? loop.loopStartMs : songPositionNow();
      if (loop.loopEnabled && Math.abs(songPositionNow() - loop.loopStartMs) > 30) {
        pauseLooper(); playbackPositionMs = loop.loopStartMs; await playLooper();
      }
      recordingTargetMs = loop.loopEnabled && loop.loopEndMs > loop.loopStartMs
        ? loop.loopEndMs - loop.loopStartMs : null;
      recordingSongProgressMs = 0; lastRecordingTick = performance.now(); recordStartedAt = performance.now();
      recordingFailure = null; lastRecordingStatusAt = 0; recordingStopReason = 'manual';
      startRecordingMeter(recordedStream);
      takeNumber++;
      const track = { id: makeId('track'), name: `Toma ${takeNumber}`, kind: 'audio', source: 'recording',
        gain: 1, pan: 0, muted: false, solo: false, clips: [] };
      const clip = { id: makeId('clip'), name: 'Grabando…', startMs: recordStartedSongMs, sourceStartMs: 0, durationMs: 0,
        captureRate: 1 / playbackRate };
      track.clips.push(clip); loop.tracks.push(track); pendingTake = { track, clip };
      renderLooper(); projectChanged();
      const supportedMime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type));
      mediaRecorder = new MediaRecorder(recordedStream, supportedMime ? { mimeType: supportedMime, audioBitsPerSecond: 128000 } : undefined);
      recordedChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) recordedChunks.push(event.data);
      };
      mediaRecorder.onerror = (event) => {
        recordingFailure = recordingErrorMessage(event.error || event);
        loopStatus.textContent = `Error de grabación: ${recordingFailure}`;
        if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') stopRecording({ reason: 'error' });
      };
      mediaRecorder.onstop = () => { pendingRecordingSave = (async () => {
        const recorder = mediaRecorder;
        const stopReason = recordingStopReason; recordingStopReason = 'manual';
        const take = pendingTake; pendingTake = null; recordingTargetMs = null; lastRecordingTick = 0;
        const blob = new Blob(recordedChunks, { type: recorder?.mimeType || 'audio/webm' });
        stopRecordingMeter();
        recordedStream?.getTracks().forEach((trackItem) => trackItem.stop()); recordedStream = null;
        const durationMs = Math.max(100, Number(take?.clip.durationMs) || recordingSongProgressMs || (performance.now() - recordStartedAt) * playbackRate);
        if (take && !loop.tracks.includes(take.track)) {
          lockTakeControls(false);
          recordButton.disabled = false; recordButton.textContent = loop.loopEnabled ? '● Grabar otra vuelta' : '● Grabar hasta detener'; recordStop.disabled = true;
          recordingFailure = null; loopStatus.textContent = 'Pista de toma cerrada.'; renderLooper(); projectChanged(); return;
        }
        if (!blob.size || !take) {
          if (take) loop.tracks = loop.tracks.filter((item) => item !== take.track);
          lockTakeControls(false);
          recordButton.disabled = false; recordButton.textContent = loop.loopEnabled ? '● Grabar otra vuelta' : '● Grabar hasta detener'; recordStop.disabled = true;
          loopStatus.textContent = recordingFailure || 'No llegaron datos de audio. Revisa el permiso y el dispositivo de entrada del micrófono.';
          recordingFailure = null; renderLooper(); projectChanged(); return;
        }
        const assetId = await ensureAudioAsset(blob, take.track.name, durationMs);
        blobCache.set(assetId, blob); take.track.assetId = assetId; take.clip.assetId = assetId;
        take.clip.durationMs = durationMs; take.clip.name = `Toma · ${timeLabel(durationMs)}`;
        loopStatus.textContent = stopReason === 'loop'
          ? `Vuelta completa · guardada como «${take.track.name}» abajo · ${timeLabel(durationMs)} · ${Math.ceil(blob.size / 1024)} KB. Puedes grabar otra capa.`
          : recordingFailure
          ? `Toma parcial guardada · ${timeLabel(durationMs)}. ${recordingFailure}`
          : `Toma guardada en una pista nueva · ${timeLabel(durationMs)} · ${Math.ceil(blob.size / 1024)} KB.`;
        recordingFailure = null;
        recordButton.textContent = loop.loopEnabled ? '● Grabar otra vuelta' : '● Grabar hasta detener';
        lockTakeControls(false); recordButton.disabled = false; recordStop.disabled = true; renderLooper(); projectChanged();
      })().catch((error) => { lockTakeControls(false); recordButton.textContent = loop.loopEnabled ? '● Grabar otra vuelta' : '● Grabar hasta detener'; recordButton.disabled = false; recordStop.disabled = true; loopStatus.textContent = `No se pudo guardar la toma: ${error?.message || error}`; }); };
      lockTakeControls(true); mediaRecorder.start(100); recordButton.textContent = '● Grabando…'; recordButton.disabled = true; recordStop.disabled = false;
      loopStatus.textContent = recordingTargetMs
        ? `Grabando una vuelta de ${timeLabel(recordingTargetMs)} desde A; se guardará al llegar a B.`
        : 'Grabando en pista nueva · pulsa «Guardar toma» cuando termines.';
    } catch (error) {
      loopStatus.textContent = recordingErrorMessage(error);
      if (pendingTake) { loop.tracks = loop.tracks.filter((item) => item !== pendingTake.track); pendingTake = null; renderLooper(); projectChanged(); }
      recordingTargetMs = null; lastRecordingTick = 0;
      stopRecordingMeter();
      recordedStream?.getTracks().forEach((trackItem) => trackItem.stop()); recordedStream = null;
      lockTakeControls(false); recordButton.disabled = false; recordStop.disabled = true;
    } finally {
      recordingStarting = false;
    }
  }
  function stopRecording({ flush = true, reason = 'manual' } = {}) {
    if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') recordingStopReason = reason;
    if (flush && mediaRecorder?.state === 'recording') updateRecordingTake();
    if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') mediaRecorder.stop();
    recordButton.textContent = 'Guardando toma…'; recordButton.disabled = true; recordStop.disabled = true;
  }
  async function toggleRecording() {
    if (mediaRecorder?.state === 'recording' || mediaRecorder?.state === 'paused') stopRecording(); else await startRecording();
  }
  recordButton.addEventListener('click', startRecording); recordStop.addEventListener('click', stopRecording);
  const loopActions = element('div', 'multi-actions loop-actions');
  const recordingActions = element('div', 'loop-control-group loop-record-controls');
  recordingActions.append(element('span', 'loop-control-title', 'Grabar una capa'), recordButton, recordStop);
  const importActions = element('div', 'loop-control-group loop-import-controls');
  importActions.append(element('span', 'loop-control-title', 'Añadir'), addAtLabel, midiImportLabel);
  loopActions.append(recordingActions, importActions);
  const clipInspector = element('section', 'multi-card loop-clip-inspector'); clipInspector.hidden = true;
  const clipInspectorTitle = element('h3', '', 'Clip seleccionado');
  const clipStartInput = numberInput(0, '.01', 'Posición del clip en la sesión en segundos');
  const clipSourceInput = numberInput(0, '.01', 'Punto de entrada en el archivo fuente en segundos');
  const clipLengthInput = numberInput(1, '.01', 'Duración del clip en segundos');
  const applyClipEdit = element('button', 'multi-button', 'Aplicar'); applyClipEdit.type = 'button';
  const duplicateClip = element('button', 'multi-button', 'Duplicar'); duplicateClip.type = 'button';
  const splitClip = element('button', 'multi-button', 'Cortar en cursor'); splitClip.type = 'button';
  const deleteClip = element('button', 'multi-button is-danger', 'Quitar clip'); deleteClip.type = 'button';
  clipInspector.append(clipInspectorTitle,
    Object.assign(element('label'), { textContent: 'Inicio (s) ' }), clipStartInput,
    Object.assign(element('label'), { textContent: 'Entrada fuente (s) ' }), clipSourceInput,
    Object.assign(element('label'), { textContent: 'Duración (s) ' }), clipLengthInput,
    applyClipEdit, duplicateClip, splitClip, deleteClip);
  const loopRecordHint = element('p', 'loop-record-hint', 'Graba una vuelta completa desde A hasta B. Al terminar, cada toma queda en su propia pista para crear capas.');
  const timeline = element('div', 'loop-timeline');
  const loopRows = element('div', 'loop-rows'); loopRows.append(timeline);
  looperPanel.append(loopTransport, loopActions, clipInspector, loopRecordHint, loopRows);

  function findSelectedClip() {
    if (!selectedClipRef) return null;
    const track = loop.tracks.find((item) => item.id === selectedClipRef.trackId);
    const clip = track?.clips?.find((item) => item.id === selectedClipRef.clipId);
    return track && clip ? { track, clip } : null;
  }

  function updateClipInspector() {
    const selected = findSelectedClip();
    clipInspector.hidden = !selected;
    if (!selected) return;
    const { track, clip } = selected;
    clipInspectorTitle.textContent = `${track.name} · ${clip.name || 'Clip'} · ${track.kind === 'midi' ? 'MIDI' : 'audio'}`;
    clipStartInput.value = ((Number(clip.startMs) || 0) / 1000).toFixed(2);
    clipSourceInput.value = ((Number(clip.sourceStartMs) || 0) / 1000).toFixed(2);
    clipSourceInput.disabled = track.kind === 'midi';
    clipLengthInput.value = ((Number(clip.durationMs) || 0) / 1000).toFixed(2);
  }

  applyClipEdit.addEventListener('click', () => {
    const selected = findSelectedClip(); if (!selected) return;
    selected.clip.startMs = Math.max(0, Number(clipStartInput.value) * 1000 || 0);
    selected.clip.durationMs = Math.max(40, Number(clipLengthInput.value) * 1000 || 100);
    if (selected.track.kind === 'audio') selected.clip.sourceStartMs = Math.max(0, Number(clipSourceInput.value) * 1000 || 0);
    renderLooper(); projectChanged();
  });
  duplicateClip.addEventListener('click', () => {
    const selected = findSelectedClip(); if (!selected) return;
    const { track, clip } = selected;
    const offset = snapDurationMs() || Math.max(100, Number(clip.durationMs) || 100);
    const copy = { ...clip, id: makeId('clip'), name: `${clip.name || track.name} · copia`,
      startMs: (Number(clip.startMs) || 0) + offset,
      events: Array.isArray(clip.events) ? clip.events.map((note) => ({ ...note })) : undefined };
    track.clips.push(copy); selectedClipRef = { trackId: track.id, clipId: copy.id };
    renderLooper(); projectChanged();
  });
  deleteClip.addEventListener('click', () => {
    const selected = findSelectedClip(); if (!selected) return;
    selected.track.clips = selected.track.clips.filter((clip) => clip.id !== selected.clip.id);
    selectedClipRef = null; renderLooper(); projectChanged();
  });
  splitClip.addEventListener('click', () => {
    const selected = findSelectedClip(); if (!selected) return;
    const { track, clip } = selected, start = Number(clip.startMs) || 0;
    const splitAt = playbackPositionMs - start;
    if (splitAt < 40 || splitAt > (Number(clip.durationMs) || 0) - 40) {
      loopStatus.textContent = 'Mueve el cursor dentro del clip para dividirlo.'; return;
    }
    const originalDuration = Number(clip.durationMs), right = { ...clip, id: makeId('clip'),
      name: `${clip.name || track.name} · B`, startMs: start + splitAt, durationMs: originalDuration - splitAt };
    if (track.kind === 'audio') right.sourceStartMs = (Number(clip.sourceStartMs) || 0) + splitAt * Math.max(.25, Math.min(4, Number(clip.captureRate) || 1));
    else {
      const leftNotes = [], rightNotes = [];
      for (const note of clip.events || []) {
        if (note.startMs < splitAt) leftNotes.push({ ...note, endMs: Math.min(note.endMs, splitAt) });
        if (note.endMs > splitAt) rightNotes.push({ ...note, startMs: Math.max(note.startMs, splitAt) - splitAt, endMs: note.endMs - splitAt });
      }
      clip.events = leftNotes; right.events = rightNotes;
    }
    clip.durationMs = splitAt; clip.name = `${clip.name || track.name} · A`; track.clips.push(right);
    selectedClipRef = { trackId: track.id, clipId: right.id }; renderLooper(); projectChanged();
  });
  clipStartInput.addEventListener('change', () => applyClipEdit.click());
  clipSourceInput.addEventListener('change', () => applyClipEdit.click());
  clipLengthInput.addEventListener('change', () => applyClipEdit.click());

  async function addAnalysisMidi() {
    const analysis = getAnalysis();
    if (!analysis?.spectralFrames?.length) { loopStatus.textContent = 'Primero analiza el audio para obtener notas MIDI estimadas.'; return; }
    const notes = midiNotesFromAnalysis(analysis);
    if (!notes.length) { loopStatus.textContent = 'No se detectaron notas para construir el MIDI.'; return; }
    loop.tracks.push({ id: makeId('track'), name: 'MIDI estimado de la mezcla', kind: 'midi', gain: 1, muted: false, solo: false,
      clips: [{ id: makeId('clip'), name: 'Melodía y registros estimados', startMs: Number(addAt.value) * 1000 || 0,
        sourceStartMs: 0, durationMs: analysis.durationMs, events: notes }] });
    renderLooper(); projectChanged();
  }
  const analysisMidiButton = element('button', 'multi-button', 'Agregar MIDI estimado de la mezcla'); analysisMidiButton.type = 'button';
  analysisMidiButton.addEventListener('click', addAnalysisMidi);
  const exportButton = element('button', 'multi-button is-primary', '⇩ Exportar mezcla WAV'); exportButton.type = 'button';
  exportButton.title = 'Renderiza una vez la mezcla completa con las pistas audibles, su volumen y paneo.';
  exportButton.addEventListener('click', exportMix);
  const exportActions = element('div', 'loop-control-group loop-export-controls');
  exportActions.append(element('span', 'loop-control-title', 'Salida'), analysisMidiButton, exportButton);
  loopActions.append(exportActions);

  function renderStemsWithSavedAssets() { renderStems().catch((error) => { separatorStatus.textContent = error.message || 'No se pudo cargar la lista de pistas.'; }); }
  function setSource() {
    refreshSource();
    if (loopEndWasAutomatic && Number(getAnalysis()?.durationMs) > 0) {
      loop.loopEndMs = Math.max(loop.loopStartMs + 100, Math.min(Number(getAnalysis().durationMs), loop.loopStartMs + 30000));
      loopBInput.value = (loop.loopEndMs / 1000).toFixed(1);
      projectChanged();
    }
    syncTracksFromAssets().catch((error) => { loopStatus.textContent = `No se pudo añadir el audio de origen: ${error?.message || error}`; });
    renderStemsWithSavedAssets();
  }
  function refreshProjectState() { renderStemsWithSavedAssets(); renderLooper(); }
  function restoreState(state = {}) {
    const restoredStems = Array.isArray(state.stems) ? state.stems : [];
    stemItems.splice(0, stemItems.length, ...restoredStems.map((stem) => ({ ...stem, runtimeAnalysis: null })));
    const savedLoop = state.loop && typeof state.loop === 'object' ? state.loop : {};
    loop.bpm = Math.max(20, Math.min(300, Number(savedLoop.bpm) || Number(getBpm()) || 120));
    loop.loopStartMs = Math.max(0, Number(savedLoop.loopStartMs) || 0);
    loopEndWasAutomatic = !Number(savedLoop.loopEndMs);
    loop.loopEndMs = Math.max(loop.loopStartMs + 100, Number(savedLoop.loopEndMs) || Math.min(defaultDuration, loop.loopStartMs + 30000));
    loop.loopEnabled = savedLoop.loopEnabled !== false;
    if (typeof savedLoop.endAutomatic === 'boolean') loopEndWasAutomatic = savedLoop.endAutomatic;
    loop.masterGain = Math.max(0, Math.min(1.25, Number(savedLoop.masterGain ?? .85)));
    loop.zoom = Math.max(6, Math.min(36, Number(savedLoop.zoom) || 12));
    loop.snap = ['bar', 'beat', 'eighth', 'sixteenth', 'off'].includes(savedLoop.snap) ? savedLoop.snap : 'beat';
    loop.positionMs = Math.max(0, Number(savedLoop.positionMs) || 0);
    playbackPositionMs = loop.positionMs;
    loop.tracks = Array.isArray(savedLoop.tracks)
      ? savedLoop.tracks.map((track) => ({ ...track, clips: (track.clips || []).map((clip) => ({ ...clip })) }))
      : [];
    loopAInput.value = (loop.loopStartMs / 1000).toFixed(1);
    loopBInput.value = (loop.loopEndMs / 1000).toFixed(1);
    loopEnabled.checked = loop.loopEnabled; bpmInput.value = String(loop.bpm);
    recordButton.textContent = loop.loopEnabled ? '● Grabar una vuelta' : '● Grabar hasta detener';
    loopRecordHint.textContent = loop.loopEnabled
      ? 'Graba una vuelta completa de A a B. Al llegar a B, la toma se guarda como una pista debajo; vuelve a grabar para sumar otra capa. Clic en la forma de onda para ubicar el cursor, arrastra los bordes para recortar y pulsa «Cortar en cursor» para dividir.'
      : 'Con el loop apagado, la toma sigue hasta que pulses «Guardar toma». Clic en la forma de onda para ubicar el cursor, arrastra los bordes para recortar y pulsa «Cortar en cursor» para dividir.';
    masterInput.value = String(loop.masterGain); masterValue.textContent = `${Math.round(loop.masterGain * 100)}%`;
    zoomInput.value = String(loop.zoom); zoomValue.textContent = `${loop.zoom} px/s`; snapInput.value = loop.snap;
    setSource(); renderLooper();
  }

  renderStemsWithSavedAssets(); renderLooper(); checkSeparation();
  return {
    audioPanel, looperPanel,
    refresh: refreshProjectState,
    setSource,
    restoreState,
    getState: () => publicProjectState(stemItems, loop),
    togglePlay: () => playbackClock ? pauseLooper() : playLooper(),
    toggleRecording,
    stop: stopLooper,
    openLooper: onOpenLooper,
    dispose: async () => {
      if (playbackTimer) clearInterval(playbackTimer); playbackTimer = null; playbackClock = null; stopScheduled();
      if (mediaRecorder?.state === 'recording') {
        const stopped = new Promise((resolve) => mediaRecorder.addEventListener('stop', resolve, { once: true }));
        mediaRecorder.stop(); await stopped; await pendingRecordingSave;
      }
      recordedStream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {});
      urlCache.forEach((url) => URL.revokeObjectURL(url)); urlCache.clear();
      if (sourceFileUrl) URL.revokeObjectURL(sourceFileUrl);
    },
  };
}
