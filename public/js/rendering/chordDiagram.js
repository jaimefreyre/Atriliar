import { parseChord } from '../music/chordParser.js';
import { SCALES, getScaleNotes, SCALE_CATEGORIES } from '../music/scales.js';
import { renderTab } from './tabRenderer.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (grave a aguda)

const QUALITY_INTERVALS = {
  '': [0,4,7], '5': [0,7], '6': [0,4,7,9], 'm6': [0,3,7,9],
  'maj7': [0,4,7,11], '7M': [0,4,7,11], 'M7': [0,4,7,11],
  'm': [0,3,7], 'm7': [0,3,7,10], '7': [0,4,7,10],
  'dim': [0,3,6], 'dim7': [0,3,6,9], 'aug': [0,4,8],
  'sus4': [0,5,7], 'sus2': [0,2,7], '7sus4': [0,5,7,10],
  'add9': [0,4,7,14], 'add11': [0,4,7,17],
  '9': [0,4,7,10,14], '11': [0,4,7,10,14,17], '13': [0,4,7,10,14,17,21]
};

const EXTENSION_INTERVALS = { '9': 14, '11': 17, '13': 21 };
const ALTERATION_MAP = { 'b5': 6, '#5': 8, 'b9': 13, '#9': 15, 'b11': 16, '#11': 18, 'b13': 20, '#13': 22 };

let currentScaleNotes = [];
let currentScaleId = null;
let currentTabData = null;

export function getChordNotes(chordStr) {
  const parsed = parseChord(chordStr);
  if (!parsed || !parsed.valid) return { root: chordStr, notes: [], bass: null, parsed: null };
  const rootIdx = NOTES.indexOf(parsed.root);
  const intervals = [...(QUALITY_INTERVALS[parsed.quality] || [0,4,7])];
  parsed.extensions.forEach(ext => { if (EXTENSION_INTERVALS[ext] !== undefined) intervals.push(EXTENSION_INTERVALS[ext]); });
  parsed.alterations.forEach(alt => { if (ALTERATION_MAP[alt] !== undefined) intervals.push(ALTERATION_MAP[alt]); });
  const notes = new Set();
  intervals.forEach(i => notes.add(NOTES[(rootIdx + i) % 12]));
  return { root: parsed.root, bass: parsed.bass, notes: Array.from(notes), parsed };
}

export function setActiveScale(root, scaleId) {
  currentScaleId = scaleId;
  currentScaleNotes = (scaleId && scaleId !== 'none') ? getScaleNotes(root, scaleId) : [];
}

export function setActiveTab(tabData) {
  currentTabData = tabData;
}

function getFretboardStyle(note, chordRoot, chordBass, chordNotes) {
  const isRoot = note === chordRoot;
  const isBass = chordBass && note === chordBass;
  const inChord = chordNotes.includes(note);
  const inScale = currentScaleNotes.includes(note);
  
  // Círculos pequeños para no superponerse
  if (isBass && !isRoot) return { fill: '#e040fb', text: '#fff', r: 9, stroke: '#ffffff', strokeWidth: 2, label: 'B', shape: 'square' };
  if (isRoot && isBass) return { fill: '#ffcc00', text: '#000', r: 9, stroke: '#ffffff', strokeWidth: 2, label: 'R' };
  if (isRoot) return { fill: '#ffcc00', text: '#000', r: 8, stroke: '#000', strokeWidth: 1, label: 'R' };
  if (inChord && inScale) return { fill: '#ff9800', text: '#000', r: 7, stroke: '#000', strokeWidth: 1 };
  if (inChord) return { fill: '#4fc3f7', text: '#000', r: 7, stroke: '#000', strokeWidth: 1 };
  if (inScale) return { fill: '#66bb6a', text: '#000', r: 5, stroke: '#000', strokeWidth: 1 };
  return null;
}

export function renderFretboard(container, chordStr) {
  const { root, bass, notes } = getChordNotes(chordStr);
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
  [3,5,7,9,12,15,17,19,21].forEach(f => {
    const x = (f - 0.5) * fretWidth;
    if (f % 12 === 0) {
      svg += `<circle cx="${x}" cy="${height/2-15}" r="3" fill="#ddd"/>`;
      svg += `<circle cx="${x}" cy="${height/2+15}" r="3" fill="#ddd"/>`;
    } else {
      svg += `<circle cx="${x}" cy="${height/2}" r="3" fill="#ddd"/>`;
    }
  });
  
  // Cuerdas
  for (let s = 0; s < 6; s++) {
    const y = (s + 1) * stringGap;
    svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e0e0e0" stroke-width="${2.5 - s*0.3}"/>`;
    svg += `<text x="-12" y="${y+4}" fill="#888" font-size="10" font-family="sans-serif">${stringNames[s]}</text>`;
  }
  
  // Notas
  const allNotes = [];
  for (let f = 0; f < frets; f++) {
    for (let s = 0; s < 6; s++) {
      const openMidi = TUNING[s];
      const midi = openMidi + f;
      const pitchClass = ((midi % 12) + 12) % 12;
      const note = NOTES[pitchClass];
      const style = getFretboardStyle(note, root, bass, notes);
      if (style) allNotes.push({ f, s, note, style });
    }
  }
  allNotes.sort((a, b) => a.style.r - b.style.r);
  
  allNotes.forEach(({ f, s, note, style }) => {
    const x = (f + 0.5) * fretWidth;
    const y = (s + 1) * stringGap;
    
    if (style.shape === 'square') {
      const size = style.r * 2;
      svg += `<rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" rx="2"/>`;
    } else {
      svg += `<circle cx="${x}" cy="${y}" r="${style.r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`;
    }
    svg += `<text x="${x}" y="${y+3}" fill="${style.text}" font-size="${style.r > 7 ? 8 : 6}" font-weight="bold" text-anchor="middle" font-family="sans-serif">${note}</text>`;
    if (style.label) {
      svg += `<text x="${x}" y="${y - style.r - 3}" fill="${style.fill}" font-size="8" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
    }
  });
  svg += `</svg>`;
  container.innerHTML = svg;
}

export function renderPiano(container, chordStr) {
  const { root, bass, notes } = getChordNotes(chordStr);
  const octaves = 2;
  const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const blackNotesMap = { 'C': 'C#', 'D': 'D#', 'F': 'F#', 'G': 'G#', 'A': 'A#' };
  const wW = 32, wH = 100, bW = 20, bH = 62;
  const totalW = whiteNotes.length * octaves;
  const width = totalW * wW + 20;
  const height = wH + 15;
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="diagram-svg">`;
  const oY = 5;
  
  const getPianoStyle = (note) => {
    const isRoot = note === root;
    const isBass = bass && note === bass;
    const inChord = notes.includes(note);
    const inScale = currentScaleNotes.includes(note);
    if (isBass && !isRoot) return { fill: '#e040fb', text: '#fff', stroke: '#ffffff', strokeWidth: 2, label: 'B' };
    if (isRoot && isBass) return { fill: '#ffcc00', text: '#000', stroke: '#ffffff', strokeWidth: 2, label: 'R' };
    if (isRoot) return { fill: '#ffcc00', text: '#000', stroke: '#000', strokeWidth: 1, label: 'R' };
    if (inChord && inScale) return { fill: '#ff9800', text: '#000', stroke: '#000', strokeWidth: 1 };
    if (inChord) return { fill: '#4fc3f7', text: '#000', stroke: '#000', strokeWidth: 1 };
    if (inScale) return { fill: '#66bb6a', text: '#000', stroke: '#000', strokeWidth: 1 };
    return null;
  };

  for (let o = 0; o < octaves; o++) {
    whiteNotes.forEach((note, i) => {
      const x = 10 + (o * 7 + i) * wW;
      const style = getPianoStyle(note);
      const fill = style ? style.fill : '#fff';
      const stroke = style ? style.stroke : '#666';
      const sw = style ? style.strokeWidth : 1;
      svg += `<rect x="${x}" y="${oY}" width="${wW-2}" height="${wH}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>`;
      if (style) {
        svg += `<text x="${x+wW/2-1}" y="${oY+wH-8}" fill="${style.text}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif">${note}</text>`;
        if (style.label) svg += `<text x="${x+wW/2-1}" y="${oY+12}" fill="${style.text}" font-size="8" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
      }
    });
  }
  for (let o = 0; o < octaves; o++) {
    whiteNotes.forEach((wn, i) => {
      if (blackNotesMap[wn]) {
        const bn = blackNotesMap[wn];
        const x = 10 + (o * 7 + i + 1) * wW - bW/2 - 1;
        const style = getPianoStyle(bn);
        const fill = style ? style.fill : '#1a1a1a';
        const stroke = style ? style.stroke : '#000';
        const sw = style ? style.strokeWidth : 1;
        svg += `<rect x="${x}" y="${oY}" width="${bW}" height="${bH}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>`;
        if (style) {
          svg += `<text x="${x+bW/2}" y="${oY+bH-6}" fill="${style.text}" font-size="7" font-weight="bold" text-anchor="middle" font-family="sans-serif">${bn}</text>`;
          if (style.label) svg += `<text x="${x+bW/2}" y="${oY+10}" fill="${style.text}" font-size="7" font-weight="bold" text-anchor="middle" font-family="sans-serif">${style.label}</text>`;
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
  
  if (fretboardEl) renderFretboard(fretboardEl, chordStr);
  if (pianoEl) renderPiano(pianoEl, chordStr);
  if (tabEl) renderTab(tabEl, currentTabData, chordStr);
  
  if (legendFret) {
    const hasScale = currentScaleNotes.length > 0;
    legendFret.innerHTML = `
      <span><span class="legend-dot" style="background:#ffcc00; border:1px solid #000"></span> Root</span>
      <span><span class="legend-dot" style="background:#e040fb; border:2px solid #fff"></span> BAJO</span>
      <span><span class="legend-dot" style="background:#4fc3f7; border:1px solid #000"></span> Acorde</span>
      ${hasScale ? '<span><span class="legend-dot" style="background:#66bb6a; border:1px solid #000"></span> Escala</span>' : ''}
    `;
  }
  if (legendPiano) legendPiano.innerHTML = legendFret.innerHTML;
  if (titleEl) titleEl.textContent = chordStr || '-';
}