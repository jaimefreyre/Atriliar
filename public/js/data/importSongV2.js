/**
 * Single entry point for getting a v2 SongDocument into IndexedDB:
 * validate fully (schema+semantic) -> resolve an id collision explicitly
 * (replace/duplicate/cancel), with no transaction open while asking ->
 * persist atomically. Never writes a partially-valid document, never
 * silently overwrites an existing id (see CONTRATO-DATOS.md rule 3 /
 * ESPECIFICACION.md REQ-01).
 */

import { getSongV2, saveSongV2 } from './indexedDb.js';
import { validateSongV2 } from './songValidator.js';

const MAX_ID_LENGTH = 100;

function makeDuplicateId(originalId) {
  const suffix = `-copy-${Date.now()}`;
  const base = originalId.slice(0, Math.max(1, MAX_ID_LENGTH - suffix.length));
  return `${base}${suffix}`;
}

/**
 * @param {object} doc a v2 SongDocument (already parsed, not yet validated)
 * @param {(existing: object, incoming: object) => Promise<'replace'|'duplicate'|'cancel'>} onCollision
 *   called only when `doc.id` already exists locally; must resolve with no
 *   IndexedDB write transaction open (a UI prompt is fine).
 * @returns {Promise<{status: 'invalid', errors: object[]} | {status: 'cancelled'} | {status: 'created'|'replaced'|'duplicated', id: string}>}
 */
export async function importSongV2Document(doc, onCollision) {
  const { valid, errors } = validateSongV2(doc);
  if (!valid) return { status: 'invalid', errors };

  const existing = await getSongV2(doc.id);
  let toSave = doc;
  let status = 'created';

  if (existing) {
    const choice = await onCollision(existing, doc);
    if (choice === 'cancel') return { status: 'cancelled' };
    if (choice === 'duplicate') {
      let newId = makeDuplicateId(doc.id);
      for (let attempts = 0; attempts < 5 && await getSongV2(newId); attempts++) {
        newId = makeDuplicateId(newId);
      }
      toSave = { ...doc, id: newId };
      status = 'duplicated';
    } else {
      status = 'replaced';
    }
  }

  await saveSongV2(toSave);
  return { status, id: toSave.id };
}

/**
 * @param {File} file
 * @param {(existing: object, incoming: object) => Promise<'replace'|'duplicate'|'cancel'>} onCollision
 */
export async function importSongV2File(file, onCollision) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch (parseErr) {
    return { status: 'parse-error', message: parseErr.message };
  }
  return importSongV2Document(raw, onCollision);
}
