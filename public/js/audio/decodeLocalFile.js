/** Decode one user-selected audio/video file locally and downmix it to mono. */
export async function decodeLocalFile(file, { AudioContextClass = window.AudioContext || window.webkitAudioContext } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('Selecciona un archivo de audio o video.');
  if (!AudioContextClass) throw new Error('Este navegador no ofrece Web Audio para decodificar el archivo.');
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const pcm = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < pcm.length; index++) pcm[index] += data[index] / buffer.numberOfChannels;
    }
    return { pcm, sampleRate: buffer.sampleRate, durationMs: Math.round(buffer.duration * 1000) };
  } finally {
    await context.close().catch(() => {});
  }
}
