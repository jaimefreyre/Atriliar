import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Runs the real worklet source inside a minimal AudioWorkletGlobalScope.
async function loadProcessor({ sampleRate = 48000 } = {}) {
  const source = await readFile(new URL('../../public/js/audio/audio-worklet-processor.js', import.meta.url), 'utf8');
  const registered = {};
  const scope = {
    sampleRate,
    currentFrame: 0,
    Float32Array,
    Math,
    AudioWorkletProcessor: class {
      constructor() { this.port = { messages: [], postMessage(message) { this.messages.push(message); } }; }
    },
    registerProcessor: (name, processor) => { registered[name] = processor; },
  };
  vm.createContext(scope);
  vm.runInContext(source, scope);
  return { scope, Processor: registered['stage-mic-frame-processor'] };
}

function render(node, scope, blocks, { channels = 1 } = {}) {
  const output = [[new Float32Array(128)]];
  for (let block = 0; block < blocks; block++) {
    const input = channels ? [Array.from({ length: channels }, () => new Float32Array(128).fill(0.1))] : [[]];
    node.process(input, output);
    scope.currentFrame += 128;
  }
}

test('los cuadros del micrófono llevan tiempo del AudioContext aunque el nodo se cree tarde', async () => {
  const { scope, Processor } = await loadProcessor();
  scope.currentFrame = 48000 * 5; // el nodo nace 5 s después del contexto (p. ej. tras cargar Essentia)
  const node = new Processor({ processorOptions: { frameMs: 20 } }); // 960 muestras a 48 kHz
  render(node, scope, 8); // 1024 muestras: completa un cuadro
  assert.equal(node.port.messages.length, 1);
  const [message] = node.port.messages;
  assert.equal(message.currentFrame, 240000);
  assert.equal(message.timestampMs, (240000 + 960) / 48000 * 1000);
  assert.equal(message.samples.length, 960);
});

test('un cuadro que cruza bloques se fecha al final real de su última muestra', async () => {
  const { scope, Processor } = await loadProcessor();
  const node = new Processor({ processorOptions: { frameMs: 20 } });
  render(node, scope, 16); // 2048 muestras → dos cuadros de 960
  const [first, second] = node.port.messages;
  assert.equal(first.timestampMs, 960 / 48000 * 1000);
  assert.equal(second.timestampMs, 1920 / 48000 * 1000);
  assert.equal(second.currentFrame, 960);
});

test('si la entrada se corta, se descarta el cuadro a medio llenar en vez de mezclar tiempos', async () => {
  const { scope, Processor } = await loadProcessor();
  const node = new Processor({ processorOptions: { frameMs: 20 } });
  render(node, scope, 4); // 512 muestras a medio cuadro
  render(node, scope, 1, { channels: 0 }); // hueco sin canales
  render(node, scope, 8);
  const [message] = node.port.messages;
  assert.equal(message.currentFrame, 640); // empieza después del hueco (128·5), no en 0
});
