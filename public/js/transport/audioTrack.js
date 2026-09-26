/**
 * Real local audio file as the transport's clock, per ESPECIFICACION.md §5
 * "Archivo de audio": songMs = audio.currentTime*1000 - offsetMs, rate fixed
 * at 1 (never editable — supportsRateChange:false blocks it even paused).
 *
 * now() already subtracts offsetMs, so it returns a value directly in song
 * time; combined with rate:1 this makes the shared transport's anchor
 * formula collapse to "whatever audio.currentTime says", which is what we
 * want — HTMLAudioElement.currentTime only advances while genuinely
 * playing, so a stall/buffering pause is reflected for free, with no
 * separate "waiting" bookkeeping required for the position itself to stay
 * honest. getMediaState() exposes buffering/seeking for a future "Pausado"
 * indicator without adding that UI here.
 *
 * Owns the audio element and its Object URL end to end: construct from a
 * Blob, revoke the URL in onDispose. A disposed flag guards every async
 * callback (play() promise, error event) so a stale one from a song that
 * was already replaced can never call back into a dead transport.
 */

/**
 * @param {Object} options
 * @param {Blob} options.blob
 * @param {number} options.offsetMs `audio.offsetMs` del documento — songMs = mediaMs - offsetMs
 * @param {number} [options.volume] 0-1
 */
export function createAudioTrackAdapter({ blob, offsetMs, volume = 1 }) {
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = objectUrl;
  audio.volume = volume;

  let errorHandler = null;
  let disposed = false;
  let muted = false;
  let volumeBeforeMute = volume;

  function mediaSecondsForSongMs(songMs) {
    return (songMs + offsetMs) / 1000;
  }

  function handleError() {
    if (disposed) return;
    const err = audio.error;
    const message = err ? `Error de audio (código ${err.code})` : 'Error de audio desconocido';
    errorHandler?.(message);
  }
  audio.addEventListener('error', handleError);

  return {
    now: () => audio.currentTime * 1000 - offsetMs,
    rate: 1,
    supportsRateChange: false,

    onPlay(fromSongMs) {
      audio.currentTime = mediaSecondsForSongMs(fromSongMs);
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (!disposed) errorHandler?.(`No se pudo iniciar la reproducción: ${err.message}`);
        });
      }
    },

    onPause() {
      audio.pause();
    },

    onSeek(songMs) {
      audio.currentTime = mediaSecondsForSongMs(songMs);
    },

    onDispose() {
      disposed = true;
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
      URL.revokeObjectURL(objectUrl);
    },

    setErrorHandler(fn) {
      errorHandler = fn;
    },

    /** No es parte del contrato del transporte — la UI la llama directo sobre el adapter. */
    setVolume(v) {
      volumeBeforeMute = v;
      if (!muted) audio.volume = v;
    },
    setMuted(shouldMute) {
      muted = shouldMute;
      audio.volume = shouldMute ? 0 : volumeBeforeMute;
    },
    getMediaState() {
      return { buffering: audio.readyState < 3, seeking: audio.seeking };
    },
  };
}

/**
 * Verifica que un archivo alcance para cubrir `offsetMs + durationMs` antes
 * de vincularlo — nunca se trunca el final en silencio (CONTRATO-DATOS.md).
 * @param {HTMLAudioElement} audio ya con metadata cargada (loadedmetadata)
 * @returns {{ok:boolean, fileDurationMs:number, requiredMs:number}}
 */
export function checkAudioCoversRange(audio, offsetMs, durationMs) {
  const fileDurationMs = audio.duration * 1000;
  const requiredMs = offsetMs + durationMs;
  return { ok: Number.isFinite(fileDurationMs) && fileDurationMs >= requiredMs, fileDurationMs, requiredMs };
}
