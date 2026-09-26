/**
 * Browser capture is started only by an explicit user action. The microphone
 * stream is never connected audibly to the output and stop/dispose closes its
 * tracks on every exit path.
 */
export function createMicCapture({ audioContext = null, onFrame = () => {}, onStatus = () => {} } = {}) {
  let context = audioContext;
  let ownsContext = !audioContext;
  let stream = null;
  let source = null;
  let worklet = null;
  let muteNode = null;
  let worker = null;
  let disposed = false;

  async function start() {
    if (disposed) throw new Error('La captura ya fue cerrada.');
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder al micrófono en este origen.');
    onStatus({ state: 'requesting', message: 'Esperando permiso del micrófono…' });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
    });
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') await context.resume();
      await context.audioWorklet.addModule(new URL('./audio-worklet-processor.js', import.meta.url));
      worker = new Worker(new URL('./onsetWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.type !== 'frame') return;
        const captureTimeSec = data.timestampMs / 1000;
        data.observedPerfMs = performance.now() - Math.max(0, context.currentTime - captureTimeSec) * 1000;
        onFrame(data);
      };
      worker.onerror = (event) => onStatus({ state: 'error', message: event.message || 'Falló el analizador de señal.' });
      source = context.createMediaStreamSource(stream);
      worklet = new AudioWorkletNode(context, 'stage-mic-frame-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { frameMs: 20 },
      });
      muteNode = context.createGain();
      muteNode.gain.value = 0;
      source.connect(worklet);
      worklet.connect(muteNode);
      muteNode.connect(context.destination);
      worklet.port.onmessage = ({ data }) => { if (worker && data.type === 'frame') worker.postMessage(data, [data.samples.buffer]); };
      onStatus({ state: 'running', message: 'Micrófono activo. La señal se procesa localmente.' });
    } catch (error) {
      await stop();
      throw error;
    }
  }

  async function stop() {
    worklet?.port.close(); worklet?.disconnect(); worklet = null;
    source?.disconnect(); source = null;
    muteNode?.disconnect(); muteNode = null;
    worker?.terminate(); worker = null;
    stream?.getTracks().forEach((track) => track.stop()); stream = null;
    if (ownsContext && context) { await context.close().catch(() => {}); context = null; }
    if (!disposed) onStatus({ state: 'stopped', message: 'Micrófono desconectado.' });
  }

  async function dispose() { if (disposed) return; disposed = true; await stop(); }
  return { start, stop, dispose, get active() { return !!stream; } };
}
