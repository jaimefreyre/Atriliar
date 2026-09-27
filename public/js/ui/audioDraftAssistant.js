import { decodeLocalFile } from '../audio/decodeLocalFile.js';
import { buildAudioDraft } from '../audio/draftBuilder.js';
import { importSongV2Document } from '../data/importSongV2.js';
import { getSongV2 } from '../data/indexedDb.js';
import { openCalibrationEditor } from './calibrationEditor.js';
import { cacheOptionalAudioTools } from '../data/offline.js';
import { createAudioAnalysisVisualizer } from './audioAnalysisVisualizer.js';
import { createMicCapture } from '../audio/micCapture.js';
import { matchChordTemplate } from '../audio/chordTemplateMatch.js';
import { compareChroma } from '../audio/chromaSimilarity.js';
import { scoreChordChroma } from '../music/chromaMatch.js';
import { getAuditionRange } from '../audio/auditionRange.js';

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
export function openAudioDraftAssistant({ onClose = () => {} } = {}) {
  if (document.getElementById('audio-draft-assistant')) return;
  cacheOptionalAudioTools().catch(() => {});
  let selectedFile = null;
  let decoded = null;
  let analysis = null;
  let worker = null;
  let mediaUrl = null;
  let mediaPlayer = null;
  let liveCapture = null;
  let liveView = null;
  let liveScores = [];
  let lastLiveSegmentStartMs = null;
  let smoothedLiveChroma = [];
  let lastPlayheadDrawAt = 0;
  let lastSignalDisplayAt = 0;
  let liveInputQuality = 'low';
  let playheadFrame = null;
  let playheadMediaPlayer = null;
  let auditionEndMs = null;
  let busy = false;
  const title = el('input', { id: 'audio-draft-title', type: 'text', maxlength: 200, placeholder: 'Título de la canción' });
  const artist = el('input', { id: 'audio-draft-artist', type: 'text', maxlength: 200, placeholder: 'Artista (opcional)' });
  const bpm = el('input', { id: 'audio-draft-bpm', type: 'number', min: 20, max: 300, step: '0.01', placeholder: 'BPM estimado' });
  const file = el('input', { id: 'audio-draft-file', type: 'file', accept: 'audio/*,video/*' });
  const storeAudio = el('input', { id: 'audio-draft-store-audio', type: 'checkbox', checked: 'checked' });
  const status = el('p', { className: 'audio-draft-status', role: 'status', 'aria-live': 'polite' }, 'Elige un archivo. Se analiza en este dispositivo.');
  const preview = el('pre', { className: 'audio-draft-preview' }, 'Sin análisis todavía.');
  const mediaPreview = el('div', { className: 'audio-study-player' });
  const analysisPanel = el('div', { id: 'audio-analysis-panel' });
  const livePanel = el('section', { className: 'audio-live-panel', hidden: 'hidden', 'aria-label': 'Karaoke de análisis en vivo' });
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
  const create = el('button', { type: 'button', className: 'btn-primary', disabled: 'true' }, 'Crear borrador y calibrar');
  const closeButton = el('button', { type: 'button', className: 'btn-secondary' }, 'Cerrar');
  const dialog = el('dialog', { id: 'audio-draft-assistant', className: 'audio-draft-panel', 'aria-labelledby': 'audio-draft-heading' });
  const heading = el('h2', { id: 'audio-draft-heading' }, 'Borrador desde audio local');
  const form = el('div', { className: 'audio-draft-form' });
  const fileLabel = el('label', { for: 'audio-draft-file' }, 'Archivo de audio o video'); fileLabel.append(file);
  const titleLabel = el('label', { for: 'audio-draft-title' }, 'Título'); titleLabel.append(title);
  const artistLabel = el('label', { for: 'audio-draft-artist' }, 'Artista'); artistLabel.append(artist);
  const bpmLabel = el('label', { for: 'audio-draft-bpm' }, 'BPM (puedes corregir la sugerencia)'); bpmLabel.append(bpm);
  const storeLabel = el('label', { for: 'audio-draft-store-audio', className: 'audio-draft-check' }, 'Guardar el archivo en el dispositivo junto con el borrador'); storeLabel.prepend(storeAudio);
  form.append(fileLabel, titleLabel, artistLabel, bpmLabel, storeLabel);
  const actions = el('footer', { className: 'audio-draft-actions' }); actions.append(analyze, create, closeButton);
  livePanel.append(el('h3', {}, 'Karaoke de análisis en vivo'),
    el('p', { className: 'audio-live-note' }, 'Inicia el micrófono y reproduce la pista para comparar la entrada con el tramo actual. Usa auriculares para que la pista no se filtre al micrófono. Se analiza localmente; el porcentaje compara perfiles de croma y no es una nota de ejecución. Si cantas una sola nota, puede faltar información para confirmar el acorde completo.'),
    liveStatus, liveMetrics, liveCompatibility, liveActions);
  dialog.append(heading,
    el('p', { className: 'audio-draft-note' }, 'El análisis estima tempo y armonía, pero puede equivocarse. Revisa el espectro, compara alternativas, escucha cada tramo y asigna tú el acorde antes de crear el borrador.'),
    form, mediaPreview, status, preview, analysisPanel, livePanel, actions);
  document.body.append(dialog);

  function cleanUp() {
    if (playheadFrame !== null) cancelAnimationFrame(playheadFrame);
    liveCapture?.dispose(); liveCapture = null;
    mediaPlayer?.pause(); mediaPlayer = null;
    worker?.terminate(); worker = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    if (dialog.open) dialog.close();
    dialog.remove(); onClose();
  }
  function fail(error) {
    worker?.terminate(); worker = null;
    decoded = null; analysis = null;
    status.textContent = error?.message || 'No se pudo completar el análisis.';
    busy = false; analyze.disabled = false; create.disabled = true;
  }
  function playbackPositionMs() { return Math.max(0, (mediaPlayer?.currentTime || 0) * 1000); }
  function playAnalysisSegment(segment) {
    if (!mediaPlayer || !analysis || !segment) return;
    const index = analysis.chordCandidates.indexOf(segment);
    const range = getAuditionRange(analysis.chordCandidates, index);
    if (!range) return;
    auditionEndMs = range.endMs;
    mediaPlayer.currentTime = range.startMs / 1000;
    liveView?.setAuditionStatus(`Reproduciendo ${range.symbol ? `${range.symbol} · ` : ''}${(range.endMs - range.startMs) / 1000 < 1 ? 'tramo' : 'pasaje'} seleccionado.`);
    const playback = mediaPlayer.play();
    if (playback?.catch) playback.catch(() => {
      auditionEndMs = null;
      liveView?.setAuditionStatus('No se pudo reproducir. Pulsa reproducir en el control de audio e inténtalo de nuevo.');
    });
    livePlayerEvents();
  }
  function currentSegment() {
    return segmentAt(playbackPositionMs());
  }
  function segmentAt(position) {
    return analysis?.chordCandidates.find((segment) => position >= segment.startMs && position < segment.endMs)
      || analysis?.chordCandidates.at(-1) || null;
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
    if (auditionEndMs !== null && playbackPositionMs() >= auditionEndMs) {
      const endMs = auditionEndMs;
      auditionEndMs = null;
      mediaPlayer.pause();
      mediaPlayer.currentTime = endMs / 1000;
      liveView?.setPlaybackPosition(endMs);
      liveView?.setAuditionStatus('Fin del pasaje. Pulsa “Escuchar tramo seleccionado” para repetirlo.');
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
    liveCapture?.dispose(); liveCapture = null; liveStop.disabled = true; liveStart.disabled = false;
    livePanel.hidden = true; liveView = null; liveScores = []; lastLiveSegmentStartMs = null;
    mediaPlayer?.pause(); mediaPlayer = null; playheadMediaPlayer = null;
    selectedFile = file.files?.[0] || null; decoded = null; analysis = null; create.disabled = true;
    analysisPanel.replaceChildren(); mediaPreview.replaceChildren(); mediaPlayer = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    if (!selectedFile) return;
    mediaUrl = URL.createObjectURL(selectedFile);
    mediaPlayer = document.createElement(selectedFile.type.startsWith('video/') ? 'video' : 'audio');
    mediaPlayer.controls = true; mediaPlayer.preload = 'metadata'; mediaPlayer.src = mediaUrl;
    mediaPreview.append(mediaPlayer);
    title.value = selectedFile.name.replace(/\.[^.]+$/, '').slice(0, 200);
    preview.textContent = `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MiB`;
    status.textContent = 'Archivo elegido. Pulsa Analizar archivo para decodificarlo localmente.';
  });
  analyze.addEventListener('click', async () => {
    if (!selectedFile || busy) return;
    busy = true; analyze.disabled = true; create.disabled = true;
    status.textContent = 'Decodificando el archivo local…';
    try {
      decoded = await decodeLocalFile(selectedFile);
      status.textContent = `Audio decodificado · ${Math.round(decoded.durationMs / 1000)} s. Cargando analizador opcional…`;
      worker?.terminate(); worker = new Worker(ANALYSIS_WORKER_URL, { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          status.textContent = 'Essentia.js listo. Analizando tempo, pulsos y cromas…';
          worker.postMessage({ ...decoded, type: 'analyse' }, [decoded.pcm.buffer]);
        } else if (data.type === 'warning') {
          status.textContent += `\n${data.message}`;
        } else if (data.type === 'analysis') {
          analysis = data;
          analysis.chordSuggestions = analysis.chordCandidates
            .filter((segment) => segment.selectedSymbol)
            .map((segment) => ({ symbol: segment.selectedSymbol, startMs: segment.startMs, endMs: segment.endMs }));
          const analysisView = createAudioAnalysisVisualizer({
            analysis,
            onChange: () => {
              analysis.chordSuggestions = analysis.chordCandidates.filter((segment) => segment.selectedSymbol)
                .map((segment) => ({ symbol: segment.selectedSymbol, startMs: segment.startMs, endMs: segment.endMs }));
              const unassigned = analysis.chordCandidates.length - analysis.chordSuggestions.length;
              preview.textContent = `${selectedFile.name}\nDuración: ${(data.durationMs / 1000).toFixed(1)} s\nBPM sugerido: ${Number.isFinite(data.bpm) ? data.bpm.toFixed(1) : 'no disponible'}\nPulsos detectados: ${data.beats.length}\nTramos estudiables: ${data.chordCandidates.length}\nAcordes asignados: ${analysis.chordSuggestions.length} · sin asignar: ${unassigned}\nLa puntuación del reconocedor es una similitud interna, no una probabilidad.`;
              updateLiveReference();
            },
            onSelect: playAnalysisSegment,
          });
          analysisPanel.replaceChildren(analysisView.element);
          liveView = analysisView;
          livePanel.hidden = false;
          livePlayerEvents(true);
          bpm.value = Number.isFinite(data.bpm) && data.bpm >= 20 && data.bpm <= 300 ? data.bpm.toFixed(2) : '';
          const unassigned = data.chordCandidates.length - analysis.chordSuggestions.length;
          preview.textContent = `${selectedFile.name}\nDuración: ${(data.durationMs / 1000).toFixed(1)} s\nBPM sugerido: ${Number.isFinite(data.bpm) ? data.bpm.toFixed(1) : 'no disponible'}\nPulsos detectados: ${data.beats.length}\nTramos estudiables: ${data.chordCandidates.length}\nAcordes asignados inicialmente: ${analysis.chordSuggestions.length} · sin asignar: ${unassigned}\nLa puntuación del reconocedor es una similitud interna, no una probabilidad.`;
          status.textContent = 'Recorre el mapa, selecciona cada tramo y confirma o corrige el acorde. Al elegir un tramo puedes reproducir desde ese punto.';
          busy = false; analyze.disabled = false; create.disabled = false;
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
          auditionEndMs = null;
          liveView?.setAuditionStatus('Escucha detenida. Pulsa “Escuchar tramo seleccionado” para volver a oírlo.');
        }
        if (event.type === 'ended' && auditionEndMs !== null) {
          auditionEndMs = null;
          liveView?.setAuditionStatus('Fin del audio. Selecciona otro tramo o vuelve al inicio para escucharlo.');
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
    liveGuess.textContent = 'Escucha: —'; liveSimilarity.textContent = 'Afinidad armónica: —';
    liveTransition.textContent = 'Secuencia: —';
    liveCompatibility.textContent = 'Compatibilidad con el acorde elegido: —';
    smoothedLiveChroma = [];
    liveStatus.textContent = 'Micrófono apagado';
    liveInputQuality = 'low';
  });
  create.addEventListener('click', async () => {
    if (!analysis || busy) return;
    const bpmValue = Number(bpm.value);
    if (!title.value.trim() || !Number.isFinite(bpmValue) || bpmValue < 20 || bpmValue > 300) {
      status.textContent = 'Escribe un título y un BPM válido entre 20 y 300.'; return;
    }
    busy = true; create.disabled = true;
    try {
      const asset = storeAudio.checked ? { id: createAssetId(), blob: selectedFile, name: selectedFile.name,
        mime: selectedFile.type || 'application/octet-stream', bytes: selectedFile.size, duration: decoded.durationMs / 1000 } : null;
      const doc = buildAudioDraft({ title: title.value, artist: artist.value, durationMs: analysis.durationMs,
        bpm: bpmValue, chordSuggestions: analysis.chordSuggestions,
        uncertainChordCount: analysis.chordCandidates.length - analysis.chordSuggestions.length,
        audioAssetId: asset?.id || null });
      const collision = await import('./importDialog.js').then(({ askCollision }) => askCollision);
      const result = await importSongV2Document(doc, collision, asset);
      if (result.status === 'invalid') throw new Error(result.errors.map((item) => `${item.instancePath}: ${item.message}`).join('\n'));
      if (result.status === 'cancelled') { busy = false; create.disabled = false; return; }
      const saved = await getSongV2(result.id);
      cleanUp();
      await openCalibrationEditor(saved, onClose);
    } catch (error) { fail(error); }
  });
  closeButton.addEventListener('click', cleanUp);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); cleanUp(); });
  dialog.showModal();
  title.focus();
  return { close: cleanUp };
}
