import { getChordTones } from '../music/harmony.js';
import { pitchClassToSharpName } from '../music/notes.js';

/** Possible pitch-class locations on standard E-A-D-G bass, not an inferred performance transcription. */
export function renderBassFretboard(container, symbol) {
  const { recognized, rootPitchClass, bassPitchClass, tones } = getChordTones(symbol || '');
  if (!recognized) { container.textContent = 'Elige un acorde para ver posiciones posibles en bajo.'; return; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 760 146'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Posiciones posibles de ${symbol} en bajo de cuatro cuerdas`);
  const add = (tag, attributes, content) => {
    const element = document.createElementNS(svg.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    if (content) element.textContent = content;
    svg.append(element); return element;
  };
  add('rect', { x: 38, y: 8, width: 700, height: 115, rx: 7, fill: '#35291d' });
  for (let fret = 0; fret <= 15; fret++) {
    const x = 50 + fret * 44;
    add('line', { x1: x, y1: 12, x2: x, y2: 119, stroke: fret === 0 ? '#f6e7c3' : '#756b5f', 'stroke-width': fret === 0 ? 4 : 1 });
    if (fret) add('text', { x: x - 22, y: 140, fill: '#bbc9bc', 'text-anchor': 'middle', 'font-size': 11 }, String(fret));
  }
  [40, 45, 50, 55].forEach((openMidi, string) => {
    const y = 24 + string * 29;
    add('line', { x1: 40, y1: y, x2: 736, y2: y, stroke: '#c5c6c0', 'stroke-width': 2 });
    add('text', { x: 15, y: y + 4, fill: '#d5dfd4', 'font-size': 12 }, ['E', 'A', 'D', 'G'][string]);
    for (let fret = 0; fret <= 15; fret++) {
      const pitch = (openMidi + fret) % 12;
      if (!tones.includes(pitch) && pitch !== bassPitchClass) continue;
      const isRoot = pitch === rootPitchClass;
      const isBass = pitch === bassPitchClass;
      const color = isBass ? '#d787e8' : isRoot ? '#f3d36b' : '#71c9e9';
      const x = fret === 0 ? 42 : 50 + (fret - .5) * 44;
      add('circle', { cx: x, cy: y, r: 10, fill: color, stroke: '#101615', 'stroke-width': 2 });
      add('text', { x, y: y + 3, fill: '#101615', 'font-size': 9, 'font-weight': 700, 'text-anchor': 'middle' }, pitchClassToSharpName(pitch));
    }
  });
  container.replaceChildren(svg);
}
