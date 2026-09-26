import { decodeLocalFile } from '../audio/decodeLocalFile.js';
import { buildAudioDraft } from '../audio/draftBuilder.js';
import { importSongV2Document } from '../data/importSongV2.js';
import { getSongV2 } from '../data/indexedDb.js';
import { openCalibrationEditor } from './calibrationEditor.js';

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
  let selectedFile = null;
  let decoded = null;
  let analysis = null;
  let worker = null;
  let busy = false;
  const title = el('input', { id: 'audio-draft-title', type: 'text', maxlength: 200, placeholder: 'Título de la canción' });
  const artist = el('input', { id: 'audio-draft-artist', type: 'text', maxlength: 200, placeholder: 'Artista (opcional)' });
  const bpm = el('input', { id: 'audio-draft-bpm', type: 'number', min: 20, max: 300, step: '0.01', placeholder: 'BPM estimado' });
  const file = el('input', { id: 'audio-draft-file', type: 'file', accept: 'audio/*,video/*' });
  const storeAudio = el('input', { id: 'audio-draft-store-audio', type: 'checkbox', checked: 'checked' });
  const status = el('p', { className: 'audio-draft-status', role: 'status', 'aria-live': 'polite' }, 'Elige un archivo. Se analiza en este dispositivo.');
  const preview = el('pre', { className: 'audio-draft-preview' }, 'Sin análisis todavía.');
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
  dialog.append(heading,
    el('p', { className: 'audio-draft-note' }, 'El análisis propone tempo y acordes por tríadas. La letra y las secciones quedan sin clasificar; revisa y corrige el resultado en el editor antes de declararlo revisado.'),
    form, status, preview, actions);
  document.body.append(dialog);

  function cleanUp() {
    worker?.terminate(); worker = null;
    if (dialog.open) dialog.close();
    dialog.remove(); onClose();
  }
  function fail(error) {
    worker?.terminate(); worker = null;
    decoded = null; analysis = null;
    status.textContent = error?.message || 'No se pudo completar el análisis.';
    busy = false; analyze.disabled = false; create.disabled = true;
  }
  file.addEventListener('change', () => {
    selectedFile = file.files?.[0] || null; decoded = null; analysis = null; create.disabled = true;
    if (!selectedFile) return;
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
          bpm.value = Number.isFinite(data.bpm) && data.bpm >= 20 && data.bpm <= 300 ? data.bpm.toFixed(2) : '';
          preview.textContent = `${selectedFile.name}\nDuración: ${(data.durationMs / 1000).toFixed(1)} s\nBPM sugerido: ${Number.isFinite(data.bpm) ? data.bpm.toFixed(1) : 'no disponible'}\nPulsos detectados: ${data.beats.length}\nOnsets: ${data.onsets.length}\nAcordes sugeridos: ${data.chordSuggestions.length} / ${data.chordCandidates.length} segmentos\nConfianza de ritmo Essentia: ${data.rhythmConfidence.toFixed(3)} (escala no interpretada como porcentaje)`;
          status.textContent = 'Vista previa lista. Revisa el BPM y crea un borrador estimado para calibrarlo.';
          busy = false; analyze.disabled = false; create.disabled = false;
          worker.terminate(); worker = null;
        } else if (data.type === 'error') fail(new Error(data.message));
      };
      worker.onerror = (event) => fail(new Error(event.message || 'Falló el Worker de audio.'));
      worker.postMessage({ type: 'init' });
    } catch (error) { fail(error); }
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
