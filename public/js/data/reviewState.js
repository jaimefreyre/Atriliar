/**
 * Local-only "a human reviewed this timing" trust record
 * (CONTRATO-DATOS.md rule 12). A document that already declares
 * `timing.status: "reviewed"` on import — or one that still says so after
 * being edited — never grants trust by itself: only isLocallyReviewed()
 * (a content-hash match against this browser's own settings store) does.
 * Consuming code (the karaoke/stage renderer, later checkpoints) must call
 * isLocallyReviewed(), never read song.timing.status alone, to decide
 * whether word-level highlighting is actually trustworthy right now.
 */

import { getSetting, saveSetting } from './indexedDb.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

/** Serialización canónica (claves ordenadas) + SHA-256 en hex. Independiente del orden de inserción de las claves. */
export async function hashDocument(doc) {
  const canonical = JSON.stringify(canonicalize(doc));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function reviewKey(songId) {
  return `review:${songId}`;
}

/** Registra que ESTE documento exacto (tal como se guardó) fue revisado localmente. */
export async function markReviewed(song) {
  const hash = await hashDocument(song);
  await saveSetting(reviewKey(song.id), { hash, reviewedAt: new Date().toISOString() });
}

/** @returns {Promise<boolean>} true solo si el hash guardado coincide con el documento actual */
export async function isLocallyReviewed(song) {
  const record = await getSetting(reviewKey(song.id));
  if (!record) return false;
  const hash = await hashDocument(song);
  return record.hash === hash;
}

/** Descarte explícito de la revisión (el usuario puede pedirlo aunque el hash siga coincidiendo). */
export async function clearReviewed(songId) {
  await saveSetting(reviewKey(songId), null);
}
