import { createMicCapture } from '../audio/micCapture.js';
import { matchOnsets } from '../audio/onsetMatcher.js';
import { getGridTimes } from '../timeline/grid.js';

const TOLERANCE_MS = 120;
const ONSET_LIMIT = 4000;

function expectedHits(song, kind) {
  const values = kind === 'chords'
    ? song.chords.map((event) => event.startMs)
    : getGridTimes({ bpm: song.metadata.bpm, timeSignature: song.metadata.timeSignature,
      durationMs: song.durationMs }).times;
  return [...new Set(values)].sort((a, b) => a - b);
}

function create(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function errorMessage(error) {
  if (error?.name === 'NotAllowedError') return 'El navegador no dio permiso para el micrófono. Puedes habilitarlo en la configuración del sitio.';
  if (error?.name === 'NotFoundError') return 'No se encontró un micrófono conectado.';
  if (error?.name === 'NotReadableError') return 'El sistema no pudo abrir el micrófono. Revisa si otra app lo está usando.';
  return error?.message || 'No se pudo iniciar el micrófono.';
}

/** Open an opt-in, local-only rhythm evaluator on the existing song clock. */
export function openPerformanceEvaluator({ song, transport, onClose = () => {} }) {
  const player = document.getElementById('player-view');
  if (!player || document.getElementById('performance-evaluator')) return;

  const permissionNote = create('p', { className: 'evaluator-privacy', text:
    'El micrófono se activa únicamente al iniciar. El audio se analiza localmente y no se graba ni se envía. Usa auriculares para evitar que la pista de referencia contamine la señal.' });
  const scope = create('select', { id: 'evaluator-scope', 'aria-label': 'Qué pulsos evaluar' }, [
    create('option', { value: 'chords', text: 'Cambios de acorde' }),
    create('option', { value: 'beats', text: 'Cada pulso de negra' }),
  ]);
  const tolerance = create('select', { id: 'evaluator-tolerance', 'aria-label': 'Tolerancia del puntaje' }, [
    create('option', { value: '80', text: '±80 ms' }),
    create('option', { value: '120', text: '±120 ms' }),
    create('option', { value: '180', text: '±180 ms' }),
  ]);
  tolerance.value = String(TOLERANCE_MS);
  const signal = create('p', { className: 'evaluator-signal', role: 'status', 'aria-live': 'polite', text: 'Micrófono apagado' });
  const instruction = create('p', { className: 'evaluator-instruction', text:
    'Elige qué debe puntuar el ejercicio y pulsa Iniciar micrófono. Después reproduce la canción desde el comienzo y toca los cambios de acorde o sigue cada pulso. La marca de tiempo proviene del transporte de esta canción.' });
  const metricTiming = create('strong', { text: '—' });
  const metricRate = create('strong', { text: '—' });
  const metricHits = create('strong', { text: '0 / 0' });
  const results = create('div', { className: 'evaluator-results', 'aria-label': 'Puntaje orientativo' }, [
    create('div', {}, [create('span', { text: 'Desvío medio' }), metricTiming]),
    create('div', {}, [create('span', { text: 'En tolerancia' }), metricRate]),
    create('div', {}, [create('span', { text: 'Ataques / eventos' }), metricHits]),
  ]);
  const startButton = create('button', { type: 'button', className: 'btn-primary', text: 'Iniciar micrófono' });
  const stopButton = create('button', { type: 'button', className: 'btn-secondary', text: 'Apagar micrófono', disabled: 'true' });
  const closeButton = create('button', { type: 'button', className: 'btn-secondary', text: 'Cerrar evaluador' });
  const dialog = create('section', { id: 'performance-evaluator', className: 'evaluator-backdrop' });
  const panel = create('div', { className: 'evaluator-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'evaluator-title' }, [
    create('header', { className: 'evaluator-header' }, [create('h2', { id: 'evaluator-title', text: 'Evaluador de ritmo · aproximación' }), closeButton]),
    permissionNote,
    instruction,
    create('div', { className: 'evaluator-options' }, [
      create('label', {}, ['Objetivo ', scope]), create('label', {}, ['Tolerancia ', tolerance]),
    ]),
    signal,
    results,
    create('p', { className: 'evaluator-limit', text:
      'Mide ataques generales del micrófono. No identifica el instrumento ni distingue ataques deliberados a contratiempo. El silencio, el ruido alto, la saturación o los parlantes pueden falsear el resultado. Úsalo como guía de ensayo, no como veredicto de precisión musical.' }),
    create('footer', { className: 'evaluator-actions' }, [startButton, stopButton, closeButton.cloneNode(true)]),
  ]);
  const actualClose = panel.querySelector('.evaluator-actions button:last-child');
  dialog.append(panel);
  player.append(dialog);

  let capture = null;
  let inputQuality = 'low';
  let lastDisplayedQuality = null;
  let detected = [];
  let closed = false;
  const openFocus = document.activeElement;
  const buttons = panel.querySelectorAll('button');
  const stopBtn = panel.querySelector('.evaluator-actions button:nth-child(2)');

  function update() {
    if (closed) return;
    const snapshot = transport.getSnapshot();
    if (snapshot.state !== 'playing') {
      metricTiming.textContent = '—'; metricRate.textContent = '—';
      instruction.textContent = snapshot.state === 'ended'
        ? 'La canción llegó al final. Reinicia desde el comienzo para una nueva ronda.'
        : 'Pulsa Iniciar micrófono y luego reproduce la canción. La evaluación comienza cuando avanza el transporte.';
      return;
    }
    if (inputQuality !== 'ok') {
      metricTiming.textContent = '—'; metricRate.textContent = '—';
      instruction.textContent = 'La calidad del micrófono está fuera del rango medible. El puntaje está pausado hasta recuperar la señal.';
      return;
    }
    const kind = scope.value;
    const targets = expectedHits(song, kind).filter((timeMs) => timeMs <= snapshot.positionMs);
    const attempts = detected.filter((timeMs) => timeMs <= snapshot.positionMs + TOLERANCE_MS);
    const report = matchOnsets(attempts, targets, { toleranceMs: Number(tolerance.value), throughMs: snapshot.positionMs });
    metricHits.textContent = `${report.matches.length} / ${report.expectedCount}`;
    metricTiming.textContent = report.meanAbsoluteErrorMs === null ? 'Esperando ataques' : `±${report.meanAbsoluteErrorMs} ms`;
    metricRate.textContent = report.precision === null ? '—' : `${Math.round(report.precision * 100)}%`;
  }

  function handleFrame(frame) {
    inputQuality = frame.quality;
    if (frame.quality !== lastDisplayedQuality) {
      signal.textContent = frame.quality === 'ok'
        ? `Señal suficiente · pico ${Math.round(frame.peak * 100)}%`
        : frame.quality === 'clipping'
          ? 'Señal saturada: baja el nivel de entrada.'
          : 'Señal baja: acércate al micrófono o sube su ganancia.';
      lastDisplayedQuality = frame.quality;
    }
    if (frame.onset && Number.isFinite(frame.observedPerfMs) && transport.getSnapshot().state === 'playing') {
      const snapshot = transport.getSnapshot();
      const framePerfMs = frame.observedPerfMs;
      const captureAgeMs = Math.max(0, performance.now() - framePerfMs);
      const eventPosition = Math.max(0, snapshot.positionMs - captureAgeMs * snapshot.rate);
      if (inputQuality === 'ok' && eventPosition >= 0) {
        detected.push(eventPosition);
        if (detected.length > ONSET_LIMIT) detected = detected.slice(-ONSET_LIMIT);
      }
    }
    update();
  }

  async function stopMic() {
    if (!capture) return;
    await capture.stop(); capture = null;
    startButton.disabled = false; stopBtn.disabled = true;
    scope.disabled = false; tolerance.disabled = false;
    lastDisplayedQuality = null;
  }

  async function startMic() {
    if (capture) return;
    startButton.disabled = true;
    try {
      capture = createMicCapture({ onFrame: handleFrame, onStatus: (status) => {
        if (status.state === 'requesting') { signal.textContent = status.message; inputQuality = 'low'; }
        if (status.state === 'running') { signal.textContent = status.message; inputQuality = 'low'; }
        if (status.state === 'error') { signal.textContent = status.message; inputQuality = 'low'; }
        if (status.state === 'stopped') { signal.textContent = status.message; inputQuality = 'low'; }
      } });
      await capture.start();
      detected = [];
      stopBtn.disabled = false;
      scope.disabled = true; tolerance.disabled = true;
    } catch (error) {
      capture = null; signal.textContent = errorMessage(error); inputQuality = 'low';
      startButton.disabled = false;
    }
  }

  async function closeDialog() {
    if (closed) return;
    closed = true;
    if (capture) { await capture.dispose(); capture = null; }
    dialog.remove();
    if (openFocus instanceof HTMLElement) openFocus.focus();
    else if (typeof onClose === 'function') onClose();
  }

  startButton.addEventListener('click', startMic);
  stopBtn.addEventListener('click', stopMic);
  closeButton.addEventListener('click', closeDialog);
  actualClose.addEventListener('click', closeDialog);
  scope.addEventListener('change', update);
  tolerance.addEventListener('change', update);
  const unsubscribe = transport.subscribe(update);
  const interval = setInterval(update, 100);
  const originalRemove = dialog.remove.bind(dialog);
  dialog.remove = () => { clearInterval(interval); unsubscribe(); originalRemove(); };
  dialog.addEventListener('keydown', (event) => {
    // Stop here: the player's own key listener would treat Esc as "exit stage".
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDialog(); return; }
    if (event.key !== 'Tab') return;
    const enabled = [...buttons].filter((button) => !button.disabled);
    const first = enabled[0]; const last = enabled.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('pointerdown', (event) => { if (event.target === dialog) closeDialog(); });
  actualClose.focus();
  update();
  return { close: closeDialog };
}
