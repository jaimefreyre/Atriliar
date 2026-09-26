/**
 * Pure selectors over a v2 SongDocument's sorted event arrays. Every event
 * is a semi-open interval [startMs, endMs). Selection depends only on
 * positionMs — never on DOM geometry, scroll offset or frame count — which
 * is what makes the active chord/line stay put when fonts or panels change.
 * Assumes the document already passed validateSongV2 (sorted, non-
 * overlapping per collection): this is selection logic, not validation.
 */

/** Índice del último evento con startMs <= positionMs Y positionMs < endMs, o -1. */
function findActiveIndex(sortedEvents, positionMs) {
  let lo = 0;
  let hi = sortedEvents.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedEvents[mid].startMs <= positionMs) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate === -1) return -1;
  return positionMs < sortedEvents[candidate].endMs ? candidate : -1;
}

function byIndex(arr, idx) {
  return idx === -1 ? null : arr[idx];
}

export function getActiveSectionIndex(song, positionMs) { return findActiveIndex(song.sections, positionMs); }
export function getActiveSection(song, positionMs) { return byIndex(song.sections, getActiveSectionIndex(song, positionMs)); }

export function getActiveLineIndex(song, positionMs) { return findActiveIndex(song.lines, positionMs); }
export function getActiveLine(song, positionMs) { return byIndex(song.lines, getActiveLineIndex(song, positionMs)); }

export function getActiveChord(song, positionMs) { return byIndex(song.chords, findActiveIndex(song.chords, positionMs)); }
export function getActiveTab(song, positionMs) { return byIndex(song.tabs, findActiveIndex(song.tabs, positionMs)); }

/** @param {object|null} line una línea (o null si no hay ninguna activa) */
export function getActiveToken(line, positionMs) {
  if (!line || !Array.isArray(line.tokens) || line.tokens.length === 0) return null;
  return byIndex(line.tokens, findActiveIndex(line.tokens, positionMs));
}

/** Línea activa, anterior y siguiente por índice — para el prompter de 3 posiciones. */
export function getAdjacentLines(song, positionMs) {
  const idx = getActiveLineIndex(song, positionMs);
  if (idx === -1) return { prev: null, current: null, next: null };
  return { prev: song.lines[idx - 1] || null, current: song.lines[idx], next: song.lines[idx + 1] || null };
}

/**
 * Secuencia navegable para el modo manual: cada línea es un bloque, y cada
 * tramo de una sección sin línea que lo cubra es un bloque instrumental —
 * así "siguiente/anterior bloque" no salta de largo los interludios.
 * @returns {{type:'line'|'instrumental', sectionId:string, startMs:number, endMs:number, line?:object}[]}
 */
export function getBlocks(song) {
  const blocks = [];
  const lines = song.lines;
  let li = 0;
  for (const section of song.sections) {
    let cursor = section.startMs;
    while (li < lines.length && lines[li].startMs < section.endMs) {
      const line = lines[li];
      if (line.startMs > cursor) {
        blocks.push({ type: 'instrumental', sectionId: section.id, startMs: cursor, endMs: line.startMs });
      }
      blocks.push({ type: 'line', sectionId: section.id, startMs: line.startMs, endMs: line.endMs, line });
      cursor = line.endMs;
      li++;
    }
    if (cursor < section.endMs) {
      blocks.push({ type: 'instrumental', sectionId: section.id, startMs: cursor, endMs: section.endMs });
    }
  }
  return blocks;
}

export function getActiveBlockIndex(blocks, positionMs) { return findActiveIndex(blocks, positionMs); }
export function getActiveBlock(blocks, positionMs) { return byIndex(blocks, getActiveBlockIndex(blocks, positionMs)); }
