/**
 * v2 tabs[] carry a pre-formatted ASCII block (CONTRATO-DATOS.md), not the
 * legacy per-note {string,fret} array renderTab() below expects. Presented
 * as text only — never interpreted as HTML, never transposed — synced by
 * block (whole tab event active/inactive), not by individual note.
 * @param {HTMLElement} container
 * @param {{label:string, ascii:string}|null} tab null when no tab covers the current position
 */
export function renderAsciiTab(container, tab) {
  if (!container) return;
  container.innerHTML = '';
  if (!tab) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.textContent = 'Sin tablatura en esta sección';
    container.appendChild(empty);
    return;
  }
  const label = document.createElement('div');
  label.className = 'tab-ascii-label';
  label.textContent = tab.label;
  const pre = document.createElement('pre');
  pre.className = 'tab-ascii';
  pre.textContent = tab.ascii;
  container.appendChild(label);
  container.appendChild(pre);
}

export function renderTab(container, tabData, chordName = "") {
  if (!container) return;
  
  if (!tabData || tabData.length === 0) {
    container.innerHTML = `<div class="tab-empty">No hay tablatura para esta línea</div>`;
    return;
  }

  // Configuración estilo Guitar Pro
  const stringNames = ['e', 'B', 'G', 'D', 'A', 'E']; // 1ra a 6ta
  const lineSpacing = 25;
  const topMargin = 30;
  const leftMargin = 40;
  const rightMargin = 40;
  const width = 800;
  const height = topMargin + (5 * lineSpacing) + 40;
  
  // Agrupar notas por posición X (para manejar acordes o secuencias)
  // Simplificación: distribuir uniformemente o por posición de traste
  const maxFret = Math.max(...tabData.map(n => n.fret), 0);
  const xStep = 60; // Espacio entre notas
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="tab-svg">`;
  
  // Título del acorde si existe
  if (chordName) {
    svg += `<text x="${width/2}" y="20" fill="#333" font-size="16" font-weight="bold" text-anchor="middle" font-family="sans-serif">${chordName}</text>`;
  }
  
  // Dibujar las 6 cuerdas
  stringNames.forEach((name, i) => {
    const y = topMargin + (i * lineSpacing);
    // Línea de la cuerda
    svg += `<line x1="${leftMargin}" y1="${y}" x2="${width - rightMargin}" y2="${y}" stroke="#333" stroke-width="1.5"/>`;
    // Nombre de la cuerda a la izquierda
    svg += `<text x="${leftMargin - 15}" y="${y + 5}" fill="#666" font-size="14" font-weight="bold" text-anchor="middle" font-family="monospace">${name}</text>`;
  });
  
  // Dibujar barras de compás (cada 4 notas aprox, o al final)
  const barX = width - rightMargin;
  svg += `<line x1="${barX}" y1="${topMargin}" x2="${barX}" y2="${topMargin + (5 * lineSpacing)}" stroke="#333" stroke-width="2"/>`;
  
  // Dibujar las notas de la tablatura
  tabData.forEach((note, index) => {
    const stringIndex = 6 - note.string; // Convertir 1-6 a 0-5
    if (stringIndex >= 0 && stringIndex < 6) {
      const x = leftMargin + 30 + (index * xStep);
      const y = topMargin + (stringIndex * lineSpacing);
      
      // Fondo blanco para el número (para tapar la línea de la cuerda)
      svg += `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" fill="#fff" rx="3"/>`;
      
      // Número del traste
      const fretText = note.fret === 0 ? '0' : note.fret.toString();
      const fontSize = fretText.length > 1 ? 11 : 13;
      svg += `<text x="${x}" y="${y + 5}" fill="#000" font-size="${fontSize}" font-weight="bold" text-anchor="middle" font-family="monospace">${fretText}</text>`;
    }
  });
  
  svg += `</svg>`;
  container.innerHTML = svg;
}