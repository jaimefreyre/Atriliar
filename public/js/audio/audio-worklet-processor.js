// This processor only frames and forwards PCM. Feature extraction and onset
// detection happen in a Web Worker to keep the real-time audio thread light.
class MicFrameProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const frameMs = options.processorOptions?.frameMs ?? 20;
    this.frameSize = Math.max(128, Math.round(sampleRate * frameMs / 1000));
    this.frame = new Float32Array(this.frameSize);
    this.writeIndex = 0;
  }

  process(inputs, outputs) {
    // `currentFrame` is the global position on the AudioContext timeline, so
    // timestamps compare directly with audioContext.currentTime no matter how
    // late this node was created (a node-local counter drifted by setup time).
    const blockStart = currentFrame;
    const input = inputs[0];
    const channels = input?.length ?? 0;
    const frames = channels ? input[0].length : 128;
    if (outputs[0]) for (const channel of outputs[0]) channel.fill(0);
    if (!channels) { this.writeIndex = 0; return true; }

    for (let index = 0; index < frames; index++) {
      let mono = 0;
      for (let channel = 0; channel < channels; channel++) mono += input[channel][index] || 0;
      this.frame[this.writeIndex++] = mono / channels;
      if (this.writeIndex === this.frameSize) {
        const endFrame = blockStart + index + 1;
        const pcm = this.frame;
        this.port.postMessage({ type: 'frame', samples: pcm, currentFrame: endFrame - this.frameSize,
          timestampMs: endFrame / sampleRate * 1000, sampleRate }, [pcm.buffer]);
        this.frame = new Float32Array(this.frameSize);
        this.writeIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor('stage-mic-frame-processor', MicFrameProcessor);
