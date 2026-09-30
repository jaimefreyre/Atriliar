const MODE_INFO = {
  autopsia: ['Autopsia del audio', 'Explora la forma de onda, el mapa armónico y cada tramo.'],
  cifrado: ['Cifrado', 'Escribe y corrige secciones, letra, acordes y tablatura.'],
  karaoke: ['Karaoke', 'Compara la entrada de micrófono con la canción en reproducción.'],
  multipista: ['Autopsia multipista', 'Revisa fuentes separadas y su relación con la mezcla.'],
  loopera: ['Loopera', 'Graba, recorta y reproduce capas sincronizadas.'],
  atril: ['Atril', 'Lee la canción con el transporte y las ayudas de interpretación.'],
};

export function renderInspector(root, route, song) {
  root.replaceChildren();
  if (!route || route.name !== 'song') { root.hidden = true; return; }
  root.hidden = false;
  const [title, description] = MODE_INFO[route.mode] || MODE_INFO.autopsia;
  const header = document.createElement('div'); header.className = 'sp-inspector__header';
  const heading = document.createElement('h2'); heading.textContent = 'Panel de contexto';
  const close = document.createElement('button'); close.className = 'sp-btn sp-btn--sm sp-btn--ghost'; close.type = 'button'; close.textContent = 'Ocultar'; close.addEventListener('click', () => { root.hidden = true; document.querySelector('.sp-workspace')?.setAttribute('data-inspector', 'closed'); });
  header.append(heading, close);
  const section = document.createElement('section'); section.className = 'sp-inspector__section';
  const eyebrow = document.createElement('p'); eyebrow.className = 'sp-eyebrow'; eyebrow.textContent = title;
  const songTitle = document.createElement('h2'); songTitle.textContent = song?.metadata?.title || (route.songId === 'new' ? 'Nuevo proyecto' : 'Canción');
  const artist = document.createElement('p'); artist.textContent = song?.metadata?.artist || 'Audio local · permanece en este dispositivo';
  const hint = document.createElement('p'); hint.className = 'sp-inspector__hint'; hint.textContent = description;
  section.append(eyebrow, songTitle, artist, hint);
  root.append(header, section);
}
