// Validador legacy v1, usado únicamente por el editor legacy en app.js
// (canciones con 'structure'). No confundir con validateSongV2 más abajo.
export function validateSong(song) {
  const errors = [];
  if (!song.id) errors.push("Falta 'id'");
  if (!song.metadata?.title) errors.push("Falta 'metadata.title'");
  if (typeof song.metadata?.bpm !== 'number' || !Number.isFinite(song.metadata.bpm) || song.metadata.bpm <= 0) errors.push("BPM inválido");
  if (!Array.isArray(song.structure)) errors.push("'structure' debe ser un array");
  else {
    song.structure.forEach((section, sIdx) => {
      if (!Array.isArray(section.lines)) errors.push(`Sección '${section.type}' falta 'lines'`);
      else {
        section.lines.forEach((line, lIdx) => {
          if (typeof line.lyrics !== 'string') errors.push(`Línea ${lIdx}: 'lyrics' debe ser string`);
          if (Array.isArray(line.chords)) {
            line.chords.forEach(ch => {
              if (typeof ch.position !== 'number' || ch.position < 0 || ch.position > line.lyrics.length) errors.push(`Acorde '${ch.chord}' tiene posición inválida`);
            });
          }
        });
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

// --- v2 (song-v2.schema.json) ---

import validateSchema from '../generated/validateSongV2.js';
import { validateSongSemantics } from './songSemantics.js';

/**
 * A v2 document declares `schemaVersion: 2`. A legacy v1 document (the only
 * other shape this project has ever produced) has no `schemaVersion` and
 * carries a `structure` array instead. Anything matching neither shape is
 * reported as unrecognized rather than guessed at.
 * @returns {'v2'|'legacy'|'unknown'}
 */
export function detectSongFormat(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.schemaVersion === 2) return 'v2';
    if (Array.isArray(raw.structure)) return 'legacy';
  }
  return 'unknown';
}

/**
 * Schema (Ajv, generated from contracts/song-v2.schema.json) + semantic pass
 * (songSemantics.js). Never partially trusts a document: semantic checks
 * only run once the schema itself is fully valid, since they assume the
 * required fields exist with the right basic types.
 * @returns {{valid: boolean, errors: {instancePath: string, message: string}[]}}
 */
export function validateSongV2(doc) {
  const schemaOk = validateSchema(doc);
  if (!schemaOk) {
    const errors = (validateSchema.errors || []).map(e => ({
      instancePath: e.instancePath ?? '/',
      message: e.message || 'error de esquema',
    }));
    return { valid: false, errors };
  }
  return validateSongSemantics(doc);
}