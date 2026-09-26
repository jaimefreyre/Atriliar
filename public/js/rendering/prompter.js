/**
 * The reading screen itself (REQ-07/REQ-08, DISENO-UI.md): one stable
 * central line, dimmed previous context, clear next line. Everything here
 * is a pure function of (song, positionMs) via timeline/selectors.js —
 * never DOM scroll, never a frame counter — so changing font size, panels
 * or window width never changes which chord/line is active. Replaces
 * songRenderer.js + chordTracker.js for the v2/stage reading path.
 *
 * Chords are anchored to a text offset, independent of when they sound:
 * a chord's anchor.charOffset only decides WHERE its label sits over the
 * text, never WHEN it's active (that's startMs/endMs, read separately).
 * Word/syllable highlighting depends on a DIFFERENT, independent offset
 * range (tokens[].charStart/charEnd), so a line's text is split at the
 * union of every chord-anchor and token boundary into minimal segments —
 * never assumed to land on word boundaries (an anchor may fall mid-word).
 */

import { getActiveSection, getActiveChord, getActiveToken, getAdjacentLines } from '../timeline/selectors.js';
import { transposeChordSymbol, transposeKey, getChordTones } from '../music/harmony.js';
import { el } from '../ui/dom.js';

function displayChordSymbol(chord, transposeSemitones) {
  return transposeSemitones ? transposeChordSymbol(chord.symbol, transposeSemitones) : chord.symbol;
}

/** transposeChordSymbol funciona igual de bien sobre una nota suelta (queda "raíz + calidad vacía"). */
function transposeNote(note, transposeSemitones) {
  if (!note) return null;
  return transposeSemitones ? transposeChordSymbol(note, transposeSemitones) : note;
}

/** Puntos de corte = anclas de acorde de esta línea ∪ límites de cada token; nunca se asume borde de palabra. */
export function computeLineSegments(line, chordsInLine) {
  const text = line.text;
  const breakpoints = new Set([0, text.length]);
  chordsInLine.forEach((c) => breakpoints.add(c.anchor.charOffset));
  (line.tokens || []).forEach((t) => { breakpoints.add(t.charStart); breakpoints.add(t.charEnd); });
  const sorted = Array.from(breakpoints).sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start >= end) continue;
    const chord = chordsInLine.find((c) => c.anchor.charOffset === start) || null;
    const tokenIdx = (line.tokens || []).findIndex((t) => t.charStart <= start && end <= t.charEnd);
    segments.push({ start, end, text: text.slice(start, end), chord, tokenIdx: tokenIdx === -1 ? null : tokenIdx });
  }
  return segments;
}

function renderLineWords(song, line, chordsInLine, transposeSemitones, highlight) {
  const wordsWrap = el('span', { className: 'words' });
  computeLineSegments(line, chordsInLine).forEach((seg) => {
    const fragment = el('span', { className: 'fragment' });
    if (seg.chord) {
      fragment.appendChild(el('span', { className: 'chord' }, [displayChordSymbol(seg.chord, transposeSemitones)]));
    }
    const textSpan = el('span', { className: 'seg-text' }, [seg.text]);
    if (highlight && seg.tokenIdx === highlight.tokenIdx) textSpan.classList.add('sounding');
    fragment.appendChild(textSpan);
    wordsWrap.appendChild(fragment);
  });
  return wordsWrap;
}

/**
 * @param {object|null} line
 * @param {object} song
 * @param {'previous'|'current'|'next'} rowClass
 * @param {number} transposeSemitones
 * @param {{positionMs:number, mode:string, locallyReviewed:boolean}|null} activeInfo solo para la fila 'current'
 */
function renderLineRow(song, line, rowClass, transposeSemitones, activeInfo) {
  const row = el('div', { className: `lyric-row ${rowClass}` });
  if (!line) {
    if (rowClass === 'current') {
      row.appendChild(el('span', { className: 'words instrumental' }, ['INSTRUMENTAL']));
    }
    return row;
  }

  const chordsInLine = song.chords.filter((c) => c.anchor && c.anchor.lineId === line.id);
  let highlight = null;
  if (activeInfo && line.tokens.length > 0) {
    // Escenario: resaltado de línea por defecto hasta revisión local. Ensayo:
    // se puede probar el resaltado por palabra igual, con aviso de estimado.
    const trusted = activeInfo.locallyReviewed;
    const useTokenHighlight = activeInfo.mode === 'stage' ? trusted : true;
    if (useTokenHighlight) {
      const activeToken = getActiveToken(line, activeInfo.positionMs);
      const tokenIdx = activeToken ? line.tokens.indexOf(activeToken) : -1;
      if (tokenIdx !== -1) highlight = { tokenIdx };
    }
    if (activeInfo.mode !== 'stage' && !trusted) {
      row.dataset.estimated = 'true';
    }
  }

  row.appendChild(renderLineWords(song, line, chordsInLine, transposeSemitones, highlight));
  return row;
}

/**
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {object|null} options.song documento v2, o null si no hay canción cargada
 * @param {number} options.positionMs
 * @param {number} [options.transposeSemitones]
 * @param {'rehearsal'|'stage'} [options.mode]
 * @param {boolean} [options.locallyReviewed]
 */
export function renderPrompter(container, options) {
  const { song, positionMs, transposeSemitones = 0, mode = 'rehearsal', locallyReviewed = false } = options;
  container.innerHTML = '';

  if (!song) {
    container.appendChild(el('div', { className: 'lyric-row current' }, [el('span', { className: 'words' }, ['Sin canción cargada'])]));
    return;
  }

  const section = getActiveSection(song, positionMs);
  const chordEvent = getActiveChord(song, positionMs);
  const { prev, current, next } = getAdjacentLines(song, positionMs);
  const sectionKey = section && section.key !== null ? section.key : song.metadata.key;
  const displayedKey = sectionKey ? transposeKey(sectionKey, transposeSemitones) : null;

  const top = el('div', { className: 'prompter-top' }, [
    el('span', { className: 'section-pill' }, [section ? section.label : '—']),
    el('span', { className: 'key-pill' }, [displayedKey || '—']),
    el('span', { className: 'timing-pill' }, [song.timing.status === 'reviewed' && locallyReviewed ? 'REVISADO' : 'ESTIMADO']),
  ]);
  container.appendChild(top);

  if (chordEvent) {
    const tones = getChordTones(chordEvent.symbol, chordEvent.bassNote);
    const bass = transposeNote(chordEvent.bassNote, transposeSemitones);
    const chordHeader = el('div', { className: 'chord-header' }, [
      el('strong', {}, [displayChordSymbol(chordEvent, transposeSemitones)]),
      tones.recognized
        ? el('span', { className: 'chord-header-detail' }, [`raíz ${transposeNote(tones.root, transposeSemitones)}${bass ? ` · bajo ${bass}` : ''}`])
        : el('span', { className: 'chord-header-detail' }, ['acorde no interpretado']),
    ]);
    container.appendChild(chordHeader);
  }

  const windowEl = el('div', { className: 'lyric-window' });
  windowEl.appendChild(renderLineRow(song, prev, 'previous', transposeSemitones, null));
  windowEl.appendChild(renderLineRow(song, current, 'current', transposeSemitones, { positionMs, mode, locallyReviewed }));
  windowEl.appendChild(renderLineRow(song, next, 'next', transposeSemitones, null));
  container.appendChild(windowEl);
}
