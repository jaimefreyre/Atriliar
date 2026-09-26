/**
 * Reading-session preferences: which song is loaded and how to show it
 * (visual transposition, font scale, rehearsal/stage mode). This is NOT
 * playback state (that lives in the transport) and NOT a panel-visibility
 * store (C5/C6) — just what the prompter needs to decide HOW to render,
 * never WHEN: "when" is always positionMs from the transport's snapshot.
 */

const listeners = new Set();
let session = {
  song: null,
  transposeSemitones: 0,
  fontScalePercent: 100,
  mode: 'rehearsal', // 'rehearsal' | 'stage' — gates the karaoke token policy (REQ-08)
};

function notify() {
  listeners.forEach((fn) => fn(session));
}

export function getSession() {
  return session;
}

export function setSong(song) {
  session = { ...session, song, transposeSemitones: 0 };
  notify();
}

export function setTranspose(semitones) {
  session = { ...session, transposeSemitones: semitones };
  notify();
}

export function setFontScale(percent) {
  session = { ...session, fontScalePercent: Math.max(70, Math.min(140, Math.round(percent))) };
  notify();
}

export function setMode(mode) {
  session = { ...session, mode };
  notify();
}

export function subscribeSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
