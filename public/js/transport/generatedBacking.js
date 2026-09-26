/**
 * Generated backing track: an AudioContext-scheduled click with a simple
 * bar accent, used as the "generated" transport mode's adapter. The actual
 * songMs clock is the shared transport's anchor math (transport.js); this
 * adapter only needs to (a) expose audioContext's own clock via now(), and
 * (b) independently schedule click audio ahead of time using the same
 * clock, per ESPECIFICACION.md §5 "Base por tempo":
 *   - a short wake-up timer (~25ms) is not the time source, only what
 *     nudges the scheduler to look ahead (~100ms) and enqueue audio;
 *   - BPM means quarter notes/minute even in 6/8 (six eighth notes = three
 *     quarters); accenting can group beats (3+3 for 6/8) without changing
 *     that unit;
 *   - tempo (rate) only changes while paused — enforced by transport.js,
 *     which is why this adapter only needs the rate at the moment onPlay
 *     starts, never mid-playback.
 */

const SCHEDULER_WAKE_MS = 25;
const LOOKAHEAD_SEC = 0.1;
const CLICK_DURATION_SEC = 0.05;
const EPSILON_MS = 1e-6;

/** 6/8, 9/8, 12/8 (and similar) accent every 3 eighth notes ("3+3"); simple meters accent only beat 1. */
function getAccentGroupSize(numerator, denominator) {
  if (denominator === 8 && numerator >= 6 && numerator % 3 === 0) return 3;
  return numerator;
}

/**
 * @param {Object} options
 * @param {AudioContext} options.audioContext
 * @param {{bpm:number, timeSignature:{numerator:number,denominator:number}}} options.metadata
 * @param {number} [options.volume] 0-1
 */
export function createGeneratedBackingAdapter({ audioContext, metadata, volume = 0.5 }) {
  const quarterMs = 60000 / metadata.bpm;
  const beatMs = (quarterMs * 4) / metadata.timeSignature.denominator;
  const accentGroupSize = getAccentGroupSize(metadata.timeSignature.numerator, metadata.timeSignature.denominator);

  let rate = 1;
  let anchorSongMs = 0;
  let anchorContextSec = audioContext.currentTime;
  let nextBeatIndex = 0;
  let schedulerTimer = null;
  const scheduledNodes = [];

  function contextTimeForSongMs(songMs) {
    return anchorContextSec + (songMs - anchorSongMs) / 1000 / rate;
  }

  function reanchor(songMs) {
    anchorSongMs = songMs;
    anchorContextSec = audioContext.currentTime;
    nextBeatIndex = Math.ceil(songMs / beatMs - EPSILON_MS);
  }

  function scheduleClick(atContextSec, accented) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.value = accented ? 1500 : 1000;
    gain.gain.setValueAtTime(volume, atContextSec);
    gain.gain.exponentialRampToValueAtTime(0.001, atContextSec + CLICK_DURATION_SEC);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(atContextSec);
    osc.stop(atContextSec + CLICK_DURATION_SEC + 0.01);
    scheduledNodes.push(osc);
    osc.onended = () => {
      const idx = scheduledNodes.indexOf(osc);
      if (idx !== -1) scheduledNodes.splice(idx, 1);
      osc.disconnect();
      gain.disconnect();
    };
  }

  function schedulerTick() {
    const windowEndSec = audioContext.currentTime + LOOKAHEAD_SEC;
    while (true) {
      const beatSongMs = nextBeatIndex * beatMs;
      const beatContextSec = contextTimeForSongMs(beatSongMs);
      if (beatContextSec > windowEndSec) break;
      if (beatContextSec >= audioContext.currentTime) {
        scheduleClick(beatContextSec, nextBeatIndex % accentGroupSize === 0);
      }
      nextBeatIndex++;
    }
  }

  function stopSchedulerTimer() {
    if (schedulerTimer !== null) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  function stopAllNodes() {
    scheduledNodes.slice().forEach((osc) => {
      try { osc.stop(0); } catch { /* ya estaba detenido */ }
    });
  }

  return {
    now: () => audioContext.currentTime * 1000,
    rate: 1,

    onPlay(fromSongMs, currentRate) {
      rate = currentRate;
      reanchor(fromSongMs);
      stopSchedulerTimer();
      schedulerTick();
      schedulerTimer = setInterval(schedulerTick, SCHEDULER_WAKE_MS);
    },

    onPause() {
      stopSchedulerTimer();
      stopAllNodes();
    },

    onSeek(songMs) {
      stopAllNodes();
      reanchor(songMs);
      // Si está sonando, el próximo despertar del scheduler ya reprograma
      // desde la nueva posición; si no, onPlay futuro vuelve a anclar igual.
    },

    onDispose() {
      stopSchedulerTimer();
      stopAllNodes();
    },
  };
}
