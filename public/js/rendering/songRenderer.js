import { transposeChord, transposeKey } from '../music/transpose.js';

export function renderSong(song, container, options = { transpose: 0, fontSize: 18 }) {
  container.innerHTML = '';
  container.style.fontSize = `${options.fontSize}px`;
  let currentKey = song.metadata.originalKey;

  song.structure.forEach(section => {
    const header = document.createElement('div');
    header.className = 'section-header';
    let sectionKey = section.key || currentKey;
    if (options.transpose !== 0) sectionKey = transposeKey(sectionKey, options.transpose);
    
    if (sectionKey !== currentKey && currentKey !== null) {
      const mod = document.createElement('div');
      mod.className = 'modulation-banner';
      mod.innerHTML = `MODULACIÓN<br><strong>${escapeHtml(currentKey)} → ${escapeHtml(sectionKey)}</strong>`;
      container.appendChild(mod);
    }
    currentKey = sectionKey;
    header.textContent = section.label || section.type;
    container.appendChild(header);

    section.lines.forEach(line => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'lyric-line';
      
      // Inyectar datos de tablatura como atributo data para que el tracker lo lea
      if (line.tab && Array.isArray(line.tab)) {
        lineDiv.dataset.tab = JSON.stringify(line.tab);
      }
      
      const charWidth = 0.6; 
      if (line.chords && line.chords.length > 0) {
        const sortedChords = [...line.chords].sort((a, b) => a.position - b.position);
        let html = '';
        let lastPos = 0;
        const lyricsArray = Array.from(line.lyrics);
        
        sortedChords.forEach((ch, idx) => {
          const transposedChord = options.transpose !== 0 ? transposeChord(ch.chord, options.transpose) : ch.chord;
          const textBefore = lyricsArray.slice(lastPos, ch.position).join('');
          html += escapeHtml(textBefore);
          html += `<span class="chord-wrapper"><span class="chord-marker">${escapeHtml(transposedChord)}</span>`;
          if (idx === sortedChords.length - 1) {
            const textAfter = lyricsArray.slice(ch.position).join('');
            html += `<span class="lyrics-after">${escapeHtml(textAfter)}</span>`;
          }
          html += `</span>`;
          lastPos = ch.position;
        });
        lineDiv.innerHTML = `<span class="lyrics-text">${html}</span>`;
      } else {
        lineDiv.innerHTML = `<span class="lyrics-text">${escapeHtml(line.lyrics)}</span>`;
      }
      container.appendChild(lineDiv);
    });
    container.appendChild(document.createElement('br'));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}