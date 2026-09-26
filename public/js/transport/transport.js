/**
 * The single transport: the only clock in the app. Renderers read
 * positionMs from getSnapshot()/subscribe(); they never decide it
 * themselves (no DOM scroll, no frame counting, no second "index of
 * progress" competing with this one).
 *
 * One instance per loaded song. Switching songs means dispose() the old
 * instance and createTransport() a brand new one — that is what makes a
 * stale generation of async work harmless: once disposed(), this instance's
 * internal loop stops touching shared state, and adapters are expected to
 * do the same in onDispose (stop schedulers/oscillators/timers, revoke
 * Object URLs).
 *
 * A mode's adapter supplies the underlying clock:
 *   now(): number        — native clock in ms (e.g. audioContext.currentTime*1000)
 *   rate: number         — 1 = real time; 0 = never advances on its own (manual mode)
 *   onPlay?(fromSongMs, rate) — start whatever engine the adapter owns
 *   onPause?()           — stop it, keep position
 *   onSeek?(songMs)      — reposition it
 *   onDispose?()         — full teardown
 *   setErrorHandler?(fn) — adapter calls fn(message) if it hits a real error (C3's audio adapter)
 *
 * @typedef {'idle'|'loading'|'ready'|'playing'|'paused'|'ended'|'error'} TransportState
 * @typedef {'audio'|'generated'|'manual'} TransportMode
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {{mode: TransportMode, durationMs: number, adapter: object}} options
 */
export function createTransport({ mode, durationMs, adapter }) {
  let state = 'ready';
  let rate = adapter.rate;
  let anchorClockMs = adapter.now();
  let anchorSongMs = 0;
  let disposed = false;
  let rafHandle = null;
  const listeners = new Set();

  function positionMs() {
    if (state !== 'playing') return anchorSongMs;
    const elapsed = adapter.now() - anchorClockMs;
    return clamp(anchorSongMs + elapsed * rate, 0, durationMs);
  }

  function getSnapshot() {
    return { state, mode, positionMs: positionMs(), durationMs, rate };
  }

  function notify() {
    if (disposed) return;
    const snap = getSnapshot();
    listeners.forEach((fn) => fn(snap));
  }

  function cancelRaf() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  function tick() {
    if (disposed || state !== 'playing') return;
    if (positionMs() >= durationMs) {
      state = 'ended';
      anchorSongMs = durationMs;
      notify();
      return; // se detiene sola; no se reprograma otro frame
    }
    notify();
    rafHandle = requestAnimationFrame(tick);
  }

  function play() {
    if (disposed || state === 'playing') return;
    if (state === 'ended') anchorSongMs = 0;
    anchorClockMs = adapter.now();
    state = 'playing';
    adapter.onPlay?.(anchorSongMs, rate);
    notify();
    rafHandle = requestAnimationFrame(tick);
  }

  function pause() {
    if (disposed || state !== 'playing') return;
    anchorSongMs = positionMs();
    cancelRaf();
    state = 'paused';
    adapter.onPause?.();
    notify();
  }

  /** A rebobinado a 0 y detiene, a diferencia de pause() que conserva la posición. */
  function stop() {
    if (disposed) return;
    cancelRaf();
    anchorSongMs = 0;
    anchorClockMs = adapter.now();
    state = 'ready';
    adapter.onPause?.();
    notify();
  }

  function seek(ms) {
    if (disposed) return;
    const target = clamp(Math.round(ms), 0, durationMs);
    anchorSongMs = target;
    anchorClockMs = adapter.now();
    if (state === 'ended' && target < durationMs) state = 'paused';
    adapter.onSeek?.(target);
    notify();
  }

  /** El BPM/tempo solo se cambia en pausa; devuelve false si se rechazó. */
  function setRate(newRate) {
    if (disposed || state === 'playing') return false;
    rate = newRate;
    notify();
    return true;
  }

  function setError(message) {
    if (disposed) return;
    cancelRaf();
    state = 'error';
    notify();
    console.error('[transport]', message);
  }

  function dispose() {
    if (disposed) return;
    cancelRaf();
    disposed = true;
    adapter.onDispose?.();
    listeners.clear();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  adapter.setErrorHandler?.(setError);

  return { getSnapshot, subscribe, play, pause, stop, seek, setRate, setError, dispose };
}
