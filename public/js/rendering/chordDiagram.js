import { getChordTones } from '../music/harmony.js';
import { getScaleNotes } from '../music/scales.js';
import { noteToPitchClass, pitchClassToSharpName, mod12 } from '../music/notes.js';
import { renderTab } from './tabRenderer.js';

const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (grave a aguda)

let currentScalePitchClasses = [];
let currentScaleId = null;
let currentTabData = null;

/**
 * Forma pública histórica (stageMode.js espera {root}) — delega en
 * harmony.js. `notes`/`root`/`bass` siguen siendo nombres para no romper el
 * único llamador externo; el renderer de este archivo usa pitch classes
 * directamente vía getChordTones().
 */
export function getChordNotes(chordStr) {
  const t = getChordTones(chordStr);
  return { root: t.root, bass: t.bass, notes: t.tones.map(pitchClassToSharpName), recognized: t.recognized };
}

export function setActiveScale(root, scaleId) {
  currentScaleId = scaleId;
  if (scaleId && scaleId !== 'none') {
    currentScalePitchClasses = getScaleNotes(root, scaleId)
      .map(noteToPitchClass)
      .filter((pc) => pc !== null);
  } else {
    currentScalePitchClasses = [];
  }
}

export function setActiveTab(tabData) {
  currentTabData = tabData;
}

const DEFAULT_LAYERS = { root: true, chord: true, bass: true, scale: true };

function getPositionStyle(pitchClass, rootPitchClass, bassPitchClass, chordPitchClasses, layers = DEFAULT_LAYERS) {
  const isRoot = layers.root && pitchClass === rootPitchClass;
  const isBass = layers.bass && bassPitchClass !== null && pitchClass === bassPitchClass;
  const inChord = layers.chord && chordPitchClasses.includes(pitchClass);
  const inScale = layers.scale && currentScalePitchClasses.includes(pitchClass);

  // Círculos pequeños para no superponerse. Una posición puede combinar
  // señales (p.ej. bajo que también pertenece al acorde); nunca se borra el
  // bajo por coincidir con una nota del acorde.
  if (isBass && !isRoot) return { fill: '#e040fb', text: '#fff', r: 9, stroke: '#ffffff', strokeWidth: 2, label: 'B', shape: 'square' };
  if (isRoot && isBass) return { fill: '#ffcc00', text: '#000', r: 9, stroke: '#ffffff', strokeWidth: 2, label: 'R' };
  if (isRoot) return { fill: '#ffcc00', text: '#000', r: 8, stroke: '#000', strokeWidth: 1, label: 'R' };
  if (inChord && inScale) return { fill: '#ff9800', text: '#000', r: 7, stroke: '#000', strokeWidth: 1 };
  if (inChord) return { fill: '#4fc3f7', text: '#000', r: 7, stroke: '#000', strokeWidth: 1 };
  if (inScale) return { fill: '#66bb6a', text: '#000', r: 5, stroke: '#000', strokeWidth: 1 };
  return null;
}

export function renderFretboard(container, chordStr, layers = DEFAULT_LAYERS, bassOverride = undefined, spectralPitches = []) {
  const { rootPitchClass, bassPitchClass, tones, recognized } = getChordTones(chordStr, bassOverride);
  const stringNames = ['E', 'A', 'D', 'G', 'B', 'E']; // 6ta a 1ra
  const frets = 22;
  const width = 900;
  const height = 150;
  const fretWidth = width / (frets + 1);
  const stringGap = height / 7;

  let svg = `<svg viewBox="-20 -5 ${width + 25} ${height + 15}" xmlns="http://www.w3.org/2000/svg" class="diagram-svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#3a2817" rx="4"/>`;

  // Trastes
  for (let f = 1; f <= frets; f++) {
    const x = f * fretWidth;
    const strokeW = (f % 12 === 0) ? 3 : 1.5;
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ccc" stroke-width="${strokeW}"/>`;
  }

  // Marcadores de traste
  [3, 5, 7, 9, 12, 15, 17, 19, 21].forEach((f) => {
    const x = (f - 0.5) * fretWidth;
    if (f % 12 === 0) {
      svg += `<circle cx="${x}" cy="${height / 2 - 15}" r="3" fill="#ddd"/>`;
      svg += `<circle cx="${x}" cy="${height / 2 + 15}" r="3" fill="#ddd"/>`;
    } else {
      svg += `<circle cx="${x}" cy="${height / 2}" r="3" fill="#ddd"/>`;
    }
  });

  // Cuerdas
  for (let s = 0; s < 6; s++) {
    const y = (s + 1) * stringGap;
    svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e0e0e0" stroke-width="${2.5 - s * 0.3}"/>`;
    svg += `<text x="-12" y="${y + 4}" fill="#888" font-size="10" font-family="sans-serif">${stringNames[s]}</text>`;
  }

  // Notas: "panel teórico desactivado" cuando el acorde no se reconoce, para
  // no dibujar una tríada inventada sobre un símbolo opaco.
  const allNotes = [];
  if (recognized) {
    for (let f = 0; f < frets; f++) {
      for (let s = 0; s < 6; s++) {
        const pitchClass = mod12(TUNING[s] + f);
        const style = getPositionStyle(pitchClass, rootPitchClass, bassPitchClass, tones, layers);
        if (style) allNotes.push({ f, s, pitchClass, style });
      }
    }
  }
  allNotes.sort((a, b) => a.style.r - b.style.r);

  allNotes.forEach(({ f, s, pitchClass, style }) => {
    const x = (f + 0.5) * fretWidth;
    const y = (s + 1) * stringGap;
    const note = pitchClassToSharpName(pitchClass);

    if (style.shape === 'square') {
      const size = style.r * 2;
      svg += `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" rx="2"/>`;
    } else {
      svg += `<circle cx="${x}" cy="${y}" r="${style.r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
    }
    svg += `<text x="${x}" y="${y + 3}" fill="${style.text}" font-size="${style.r > 7 ? 8 : 6}" font-weight="bold" text-anchor="middle" font-family="sans-serif">${note}</text>`;
    if (style.label) {
      svg += `<text x="${x}" y="${y - style.r - 3}" fill="${style.fill}" font-size="8" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
    }
  });
  const strongestPitches = [...new Map((spectralPitches || [])
    .filter((peak) => Number.isFinite(peak.midi) && peak.midi >= 40 && peak.midi <= 86)
    .sort((a, b) => (b.strength || 0) - (a.strength || 0))
    .map((peak) => [Math.round(peak.midi), peak])).values()].slice(0, 6);
  strongestPitches.forEach((peak) => {
    const midi = Math.round(peak.midi);
    for (let s = 0; s < TUNING.length; s++) {
      const fret = midi - TUNING[s];
      if (fret < 0 || fret >= frets) continue;
      const x = (fret + 0.5) * fretWidth;
      const y = (s + 1) * stringGap;
      const label = peak.note || `${pitchClassToSharpName(mod12(midi))}${Math.floor(midi / 12) - 1}`;
      const strength = Math.max(0, Math.min(1, Number(peak.strength) || 0));
      svg += `<g class="fretboard-spectral-pitch"><title>${label} · pico espectral · ${Math.round(strength * 100)}%</title>`;
      svg += `<circle cx="${x}" cy="${y}" r="7" fill="#f15acb" stroke="#fff" stroke-width="1.5"/>`;
      svg += `<text x="${x}" y="${y + 2.1}" fill="#180d18" font-size="5.6" font-weight="900" text-anchor="middle" font-family="sans-serif">${label}</text></g>`;
    }
  });
  svg += `</svg>`;
  container.innerHTML = svg;
}

export function renderPiano(container, chordStr, layers = DEFAULT_LAYERS, bassOverride = undefined) {
  const { rootPitchClass, bassPitchClass, tones, recognized } = getChordTones(chordStr, bassOverride);
  const octaves = 2;
  const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const blackNotesMap = { 'C': 'C#', 'D': 'D#', 'F': 'F#', 'G': 'G#', 'A': 'A#' };
  const wW = 32, wH = 100, bW = 20, bH = 62;
  const totalW = whiteNotes.length * octaves;
  const width = totalW * wW + 20;
  const height = wH + 15;

  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="diagram-svg">`;
  const oY = 5;

  const getPianoStyle = (noteName) => {
    if (!recognized) return null;
    return getPositionStyle(noteToPitchClass(noteName), rootPitchClass, bassPitchClass, tones, layers);
  };

  for (let o = 0; o < octaves; o++) {
    whiteNotes.forEach((note, i) => {
      const x = 10 + (o * 7 + i) * wW;
      const style = getPianoStyle(note);
      const fill = style ? style.fill : '#fff';
      const stroke = style ? style.stroke : '#666';
      const sw = style ? style.strokeWidth : 1;
      svg += `<rect x="${x}" y="${oY}" width="${wW - 2}" height="${wH}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>`;
      if (style) {
        svg += `<text x="${x + wW / 2 - 1}" y="${oY + wH - 8}" fill="${style.text}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif">${note}</text>`;
        if (style.label) svg += `<text x="${x + wW / 2 - 1}" y="${oY + 12}" fill="${style.text}" font-size="8" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
      }
    });
  }
  for (let o = 0; o < octaves; o++) {
    whiteNotes.forEach((wn, i) => {
      if (blackNotesMap[wn]) {
        const bn = blackNotesMap[wn];
        const x = 10 + (o * 7 + i + 1) * wW - bW / 2 - 1;
        const style = getPianoStyle(bn);
        const fill = style ? style.fill : '#1a1a1a';
        const stroke = style ? style.stroke : '#000';
        const sw = style ? style.strokeWidth : 1;
        svg += `<rect x="${x}" y="${oY}" width="${bW}" height="${bH}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>`;
        if (style) {
          svg += `<text x="${x + bW / 2}" y="${oY + bH - 6}" fill="${style.text}" font-size="7" font-weight="bold" text-anchor="middle" font-family="sans-serif">${bn}</text>`;
          if (style.label) svg += `<text x="${x + bW / 2}" y="${oY + 10}" fill="${style.text}" font-size="7" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
        }
      }
    });
  }
  svg += `</svg>`;
  container.innerHTML = svg;
}

export function updateChordDiagrams(chordStr, tabData = null) {
  if (tabData !== null) setActiveTab(tabData);
  const fretboardEl = document.getElementById('diagram-fretboard');
  const pianoEl = document.getElementById('diagram-piano');
  const tabEl = document.getElementById('diagram-tab');
  const legendFret = document.getElementById('legend-fretboard');
  const legendPiano = document.getElementById('legend-piano');
  const titleEl = document.getElementById('current-chord');

  const { recognized } = getChordTones(chordStr);

  if (fretboardEl) renderFretboard(fretboardEl, chordStr);
  if (pianoEl) renderPiano(pianoEl, chordStr);
  if (tabEl) renderTab(tabEl, currentTabData, chordStr);

  if (legendFret) {
    const hasScale = currentScalePitchClasses.length > 0;
    legendFret.innerHTML = `
      <span><span class="legend-dot" style="background:#ffcc00; border:1px solid #000"></span> Root</span>
      <span><span class="legend-dot" style="background:#e040fb; border:2px solid #fff"></span> BAJO</span>
      <span><span class="legend-dot" style="background:#4fc3f7; border:1px solid #000"></span> Acorde</span>
      ${hasScale ? '<span><span class="legend-dot" style="background:#66bb6a; border:1px solid #000"></span> Escala</span>' : ''}
      ${!recognized ? '<span>Acorde no interpretado</span>' : ''}
    `;
  }
  if (legendPiano) legendPiano.innerHTML = legendFret.innerHTML;
  if (titleEl) titleEl.textContent = chordStr || '-';
}
