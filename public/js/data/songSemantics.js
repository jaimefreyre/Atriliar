/**
 * Second validation pass: relations that plain JSON Schema can't express
 * (cross-field comparisons, references between collections, coverage).
 * Only meaningful to run after the generated schema validator already
 * passed — this assumes required fields exist with the right basic types.
 * Rules mirror docs/spec-v2/contratos/CONTRATO-DATOS.md "Validación semántica
 * obligatoria" (12 numbered rules); rule 12, the local review-hash trust
 * record, lives in the storage layer instead (it isn't a document shape
 * invariant).
 */

import { SCALES } from '../music/scales.js';
import { sameNote, extractSlashBass } from '../music/notes.js';

function isSafeMs(n) {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function err(errors, path, message) {
  errors.push({ instancePath: path, message });
}

/** Never split a UTF-16 surrogate pair when treating `offset` as a boundary. */
function isGraphemeBoundary(text, offset) {
  if (offset > 0 && offset < text.length) {
    const before = text.charCodeAt(offset - 1);
    const at = text.charCodeAt(offset);
    const beforeIsHighSurrogate = before >= 0xd800 && before <= 0xdbff;
    const atIsLowSurrogate = at >= 0xdc00 && at <= 0xdfff;
    if (beforeIsHighSurrogate && atIsLowSurrogate) return false;
  }
  return true;
}

function checkInterval(errors, path, startMs, endMs, durationMs) {
  let ok = true;
  if (!isSafeMs(startMs)) { err(errors, `${path}/startMs`, 'startMs debe ser un entero seguro >= 0'); ok = false; }
  if (!isSafeMs(endMs)) { err(errors, `${path}/endMs`, 'endMs debe ser un entero seguro >= 0'); ok = false; }
  if (ok && startMs >= endMs) { err(errors, path, `startMs (${startMs}) debe ser menor que endMs (${endMs})`); ok = false; }
  if (ok && endMs > durationMs) { err(errors, `${path}/endMs`, `endMs (${endMs}) no puede superar durationMs (${durationMs})`); ok = false; }
  return ok;
}

function checkUniqueIds(errors, arrayName, items) {
  const firstIndexOf = new Map();
  items.forEach((item, idx) => {
    if (firstIndexOf.has(item.id)) {
      err(errors, `/${arrayName}/${idx}/id`, `id "${item.id}" duplicado en ${arrayName} (también en índice ${firstIndexOf.get(item.id)})`);
    } else {
      firstIndexOf.set(item.id, idx);
    }
  });
}

function checkChronological(errors, arrayName, items) {
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1], cur = items[i];
    const tie = cur.startMs === prev.startMs && prev.id !== undefined && String(cur.id) < String(prev.id);
    if (cur.startMs < prev.startMs || tie) {
      err(errors, `/${arrayName}/${i}/startMs`, `${arrayName} debe estar ordenado por startMs (y por id en empates), ver índice ${i - 1}`);
    }
  }
}

function checkNoOverlap(errors, arrayName, items) {
  const sorted = items.map((item, idx) => ({ item, idx })).sort((a, b) => a.item.startMs - b.item.startMs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].item, cur = sorted[i].item;
    if (cur.startMs < prev.endMs) {
      err(errors, `/${arrayName}/${sorted[i].idx}`,
        `${arrayName} solapa con índice ${sorted[i - 1].idx} (${prev.startMs}-${prev.endMs} vs ${cur.startMs}-${cur.endMs})`);
    }
  }
}

/**
 * @param {object} doc a SongDocument that already passed the JSON Schema check
 * @returns {{valid: boolean, errors: {instancePath: string, message: string}[]}}
 */
export function validateSongSemantics(doc) {
  const errors = [];
  const durationMs = doc.durationMs;

  if (!isSafeMs(durationMs) || durationMs <= 0) {
    err(errors, '/durationMs', 'durationMs debe ser un entero positivo seguro');
    return { valid: false, errors };
  }

  // --- sections: unique ids, chronological, exact partition of [0,durationMs) ---
  const sections = doc.sections;
  checkUniqueIds(errors, 'sections', sections);
  checkChronological(errors, 'sections', sections);
  sections.forEach((s, i) => checkInterval(errors, `/sections/${i}`, s.startMs, s.endMs, durationMs));
  if (sections.length > 0) {
    if (sections[0].startMs !== 0) {
      err(errors, '/sections/0/startMs', 'la primera sección debe empezar en 0');
    }
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].startMs !== sections[i - 1].endMs) {
        err(errors, `/sections/${i}/startMs`, `hueco o solape entre las secciones ${i - 1} y ${i}: deben formar una partición sin huecos de [0,durationMs)`);
      }
    }
    const lastIdx = sections.length - 1;
    if (sections[lastIdx].endMs !== durationMs) {
      err(errors, `/sections/${lastIdx}/endMs`, `la última sección debe terminar exactamente en durationMs (${durationMs})`);
    }
  }
  const sectionIds = new Set(sections.map(s => s.id));
  const sectionById = new Map(sections.map(s => [s.id, s]));

  // --- lines: unique ids, chronological, within their section, non-overlapping globally ---
  const lines = doc.lines;
  checkUniqueIds(errors, 'lines', lines);
  checkChronological(errors, 'lines', lines);
  const lineById = new Map();
  lines.forEach((l, i) => {
    lineById.set(l.id, l);
    checkInterval(errors, `/lines/${i}`, l.startMs, l.endMs, durationMs);
    if (!sectionIds.has(l.sectionId)) {
      err(errors, `/lines/${i}/sectionId`, `sectionId "${l.sectionId}" no existe`);
    } else {
      const section = sectionById.get(l.sectionId);
      if (l.startMs < section.startMs || l.endMs > section.endMs) {
        err(errors, `/lines/${i}`, `la línea debe quedar dentro del intervalo de su sección "${l.sectionId}"`);
      }
    }
  });
  checkNoOverlap(errors, 'lines', lines);

  // --- tokens per line: within line, ordered, non-overlapping in time and text, exact slice, full non-blank coverage ---
  lines.forEach((line, li) => {
    const text = line.text;
    const tokens = line.tokens;
    checkChronological(errors, `lines/${li}/tokens`, tokens);
    let lastCharEnd = 0;
    tokens.forEach((tok, ti) => {
      const path = `/lines/${li}/tokens/${ti}`;
      checkInterval(errors, path, tok.startMs, tok.endMs, durationMs);
      if (tok.startMs < line.startMs || tok.endMs > line.endMs) {
        err(errors, path, 'el token debe quedar dentro del intervalo de su línea');
      }
      if (!(tok.charStart < tok.charEnd)) {
        err(errors, `${path}/charEnd`, 'charEnd debe ser mayor que charStart');
        return;
      }
      if (tok.charEnd > text.length) {
        err(errors, `${path}/charEnd`, `charEnd (${tok.charEnd}) supera la longitud del texto (${text.length})`);
        return;
      }
      if (!isGraphemeBoundary(text, tok.charStart) || !isGraphemeBoundary(text, tok.charEnd)) {
        err(errors, path, 'el token corta un par subrogado UTF-16');
      }
      const slice = text.slice(tok.charStart, tok.charEnd);
      if (slice !== tok.text) {
        err(errors, `${path}/text`, `token.text ("${tok.text}") no coincide con text.slice(${tok.charStart},${tok.charEnd}) ("${slice}")`);
      }
      if (tok.charStart < lastCharEnd) {
        err(errors, path, 'los tokens se solapan en offsets de caracteres');
      }
      lastCharEnd = Math.max(lastCharEnd, tok.charEnd);
    });
    if (tokens.length > 0) {
      const covered = new Array(text.length).fill(false);
      tokens.forEach(tok => {
        for (let c = tok.charStart; c < tok.charEnd && c < text.length; c++) covered[c] = true;
      });
      for (let c = 0; c < text.length; c++) {
        if (!covered[c] && !/\s/.test(text[c])) {
          err(errors, `/lines/${li}/tokens`, `los tokens no cubren el carácter no-blanco en la posición ${c} de la línea "${line.id}"`);
          break;
        }
      }
    }
  });

  // --- chords: unique ids, chronological, non-overlapping globally, anchors, bassNote, scale ---
  const chords = doc.chords;
  checkUniqueIds(errors, 'chords', chords);
  checkChronological(errors, 'chords', chords);
  chords.forEach((c, i) => checkInterval(errors, `/chords/${i}`, c.startMs, c.endMs, durationMs));
  checkNoOverlap(errors, 'chords', chords);
  chords.forEach((c, i) => {
    const path = `/chords/${i}`;
    if (c.anchor !== null) {
      const line = lineById.get(c.anchor.lineId);
      if (!line) {
        err(errors, `${path}/anchor/lineId`, `lineId "${c.anchor.lineId}" no existe`);
      } else {
        if (c.anchor.charOffset >= line.text.length) {
          err(errors, `${path}/anchor/charOffset`, `charOffset (${c.anchor.charOffset}) debe ser menor que la longitud de la línea (${line.text.length})`);
        } else if (!isGraphemeBoundary(line.text, c.anchor.charOffset)) {
          err(errors, `${path}/anchor/charOffset`, 'charOffset corta un par subrogado UTF-16');
        }
        if (c.startMs < line.startMs || c.startMs >= line.endMs) {
          err(errors, `${path}/startMs`, 'el inicio del acorde anclado debe estar dentro del intervalo de la línea anclada');
        }
      }
    }
    const slashBass = extractSlashBass(c.symbol);
    if (slashBass !== null) {
      if (c.bassNote === null || !sameNote(c.bassNote, slashBass)) {
        err(errors, `${path}/bassNote`, `bassNote debe coincidir enarmónicamente con el bajo indicado por el símbolo "${c.symbol}" (${slashBass})`);
      }
    }
    if (c.scale !== null && !(c.scale.id in SCALES)) {
      err(errors, `${path}/scale/id`, `scale.id "${c.scale.id}" no está en el catálogo de la aplicación`);
    }
  });

  // --- tabs: unique ids, within section, non-overlapping within the same section ---
  const tabs = doc.tabs;
  checkUniqueIds(errors, 'tabs', tabs);
  tabs.forEach((t, i) => {
    checkInterval(errors, `/tabs/${i}`, t.startMs, t.endMs, durationMs);
    if (!sectionIds.has(t.sectionId)) {
      err(errors, `/tabs/${i}/sectionId`, `sectionId "${t.sectionId}" no existe`);
    } else {
      const section = sectionById.get(t.sectionId);
      if (t.startMs < section.startMs || t.endMs > section.endMs) {
        err(errors, `/tabs/${i}`, `la tab debe quedar dentro del intervalo de su sección "${t.sectionId}"`);
      }
    }
  });
  const tabsBySection = new Map();
  tabs.forEach((t, i) => {
    if (!tabsBySection.has(t.sectionId)) tabsBySection.set(t.sectionId, []);
    tabsBySection.get(t.sectionId).push({ startMs: t.startMs, endMs: t.endMs, idx: i });
  });
  for (const group of tabsBySection.values()) {
    group.sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < group.length; i++) {
      if (group[i].startMs < group[i - 1].endMs) {
        err(errors, `/tabs/${group[i].idx}`, `la tab solapa con la tab en índice ${group[i - 1].idx} dentro de la misma sección`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
