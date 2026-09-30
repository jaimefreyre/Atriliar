// Clickable prototype of the redesign (stage EP). Throwaway code: only the
// CSS (tokens.css, components.css) is shared with the real app. Data comes
// from docs/spec-v2/contratos/demo-original.song.json.

const DURATION_MS = 32000;
const BPM = 120;
const BEAT_MS = 60000 / BPM;
const BAR_MS = BEAT_MS * 4;

const SONG = {
  title: 'Camino de luz · demo original',
  artist: 'Composición de demostración',
  key: 'C', bpm: BPM, meter: '4/4',
};

const SECTIONS = [
  { id: 'intro', label: 'Intro', startMs: 0, endMs: 4000 },
  { id: 'verse', label: 'Verso', startMs: 4000, endMs: 16000 },
  { id: 'chorus', label: 'Estribillo', startMs: 16000, endMs: 28000 },
  { id: 'outro', label: 'Cierre', startMs: 28000, endMs: 32000 },
];

const LINES = [
  { id: 'l1', section: 'verse', startMs: 4000, endMs: 8000, text: 'Enciende la luz del camino', chords: [[0, 'C'], [12, 'G']] },
  { id: 'l2', section: 'verse', startMs: 8000, endMs: 12000, text: 'Mis pasos encuentran su voz', chords: [[0, 'Am'], [10, 'F']] },
  { id: 'l3', section: 'verse', startMs: 12000, endMs: 16000, text: 'La noche respira conmigo', chords: [[0, 'C'], [9, 'G']] },
  { id: 'l4', section: 'chorus', startMs: 16000, endMs: 20000, text: 'Vamos al pulso del viento', chords: [[0, 'F'], [9, 'G']] },
  { id: 'l5', section: 'chorus', startMs: 20000, endMs: 24000, text: 'Canta la calle al pasar', chords: [[0, 'C'], [9, 'Am']] },
  { id: 'l6', section: 'chorus', startMs: 24000, endMs: 28000, text: 'Dejamos el miedo en el suelo', chords: [[0, 'F'], [17, 'G']] },
];

const TAB = `e|-----0-------0-----|-----0-------0-----|
B|---1---1---1---1---|---1---1---1---1---|
G|-0-------0-------0-|-0-------0-------0-|
D|-------------------|-------------------|
A|-3-----------------|-3-----------------|
E|-------------------|-------------------|`;

// One decoding per "Sensibilidad de cambios" preset. The first two chords are
// user-confirmed and survive every preset (they act as decoding constraints).
const R = (symbol, startMs, endMs, state = 'auto') => ({ symbol, startMs, endMs, state });
const HARMONY = {
  estable: [R('C', 0, 2000, 'confirmed'), R('Am', 2000, 4000, 'confirmed'), R('C', 4000, 6000), R('G', 6000, 8000),
    R('Am', 8000, 10000), R('F', 10000, 12000), R('C', 12000, 16000), R('F', 16000, 18000), R('G', 18000, 20000),
    R('C', 20000, 24000, 'doubtful'), R('F', 24000, 26000), R('G', 26000, 28000), R('C', 28000, 32000)],
  normal: [R('C', 0, 2000, 'confirmed'), R('Am', 2000, 4000, 'confirmed'), R('C', 4000, 6000), R('G', 6000, 8000),
    R('Am', 8000, 10000), R('F', 10000, 12000), R('C', 12000, 14000), R('G', 14000, 16000, 'doubtful'), R('F', 16000, 18000),
    R('G', 18000, 20000), R('C', 20000, 22000), R('Am', 22000, 24000), R('F', 24000, 26000), R('G', 26000, 28000), R('C', 28000, 32000)],
  detallada: [R('C', 0, 2000, 'confirmed'), R('Am', 2000, 4000, 'confirmed'), R('C', 4000, 5000), R('C/E', 5000, 6000, 'doubtful'),
    R('G', 6000, 7000), R('G/B', 7000, 8000), R('Am', 8000, 10000), R('F', 10000, 12000), R('C', 12000, 14000),
    R('G', 14000, 16000, 'doubtful'), R('F', 16000, 18000), R('G', 18000, 20000), R('C', 20000, 22000), R('Am', 22000, 24000),
    R('F', 24000, 25000), R('Dm7', 25000, 26000, 'doubtful'), R('G', 26000, 27000), R('G7', 27000, 28000), R('C', 28000, 32000)],
};

const ALTERNATIVES = {
  C: [['C6', 'mismas notas que Am7'], ['Cmaj7', 'color']], Am: [['Am7', 'color'], ['C6', 'mismas notas']],
  G: [['G7', 'color'], ['Em', 'otra raíz']], F: [['Fmaj7', 'color'], ['Dm7', 'mismas notas que F6']],
  'C/E': [['C', 'sin bajo'], ['Em', 'otra raíz']], 'G/B': [['G', 'sin bajo'], ['Bdim', 'otra raíz']],
  Dm7: [['F6', 'mismas notas'], ['F', 'sin color']], G7: [['G', 'sin color'], ['Bdim', 'otra raíz']],
};

const TONES = { C: [0, 4, 7], Am: [9, 0, 4], G: [7, 11, 2], F: [5, 9, 0], 'C/E': [0, 4, 7], 'G/B': [7, 11, 2], Dm7: [2, 5, 9, 0], G7: [7, 11, 2, 5] };
const SHAPES = { C: 'x32010', Am: 'x02210', G: '320003', F: '133211', 'C/E': '032010', 'G/B': 'x20003', Dm7: 'xx0211', G7: '320001' };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const STEMS_4 = ['Voz', 'Batería', 'Bajo', 'Otros'];
const STEMS_6 = ['Voz', 'Batería', 'Bajo', 'Guitarra', 'Piano', 'Otros'];

const state = {
  route: 'library',
  protoState: 'normal',
  sensitivity: 'normal',
  selectedIndex: 3,
  selectedLine: 'l2',
  inspectorOpen: true,
  lanes: { stems: false, notes: false, spectrum: false },
  stems: [],
  separatingProgress: null,
  analyzingProgress: null,
  positionMs: 9000,
  playing: false,
  speed: 1,
  guide: 'mix',
  loop: false,
  liveView: 'cotejo',
  instrument: 'guitarra',
  samples: [
    { id: 's1', name: 'Riff intro', meta: '2 compases · mezcla', bars: [0, 2] },
    { id: 's2', name: 'Groove verso', meta: '4 compases · mezcla', bars: [2, 6] },
  ],
  selectedPad: 's1',
  recording: false,
};

const app = document.getElementById('app');
const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const pct = (ms) => ms / DURATION_MS;
const regions = () => HARMONY[state.sensitivity];
const currentAt = (list, ms) => list.find((item) => ms >= item.startMs && ms < item.endMs) || list.at(-1);
const hasMic = () => state.protoState !== 'noMic';
const audioMissing = () => state.protoState === 'noAudio';

function toast(message) {
  const node = document.createElement('div');
  node.className = 'sp-toast';
  node.textContent = message;
  document.getElementById('toasts').append(node);
  setTimeout(() => node.remove(), 3200);
}

// ---------- Fake transport shared by every mode ----------
let lastTick = null;
function tick(now) {
  if (!state.playing) { lastTick = null; return; }
  if (lastTick !== null) state.positionMs += (now - lastTick) * state.speed;
  lastTick = now;
  if (state.loop && state.route === 'karaoke' && state.positionMs >= 28000) state.positionMs = 16000;
  if (state.positionMs >= DURATION_MS) { state.positionMs = DURATION_MS; state.playing = false; render(); return; }
  updateNow();
  requestAnimationFrame(tick);
}
function togglePlay() {
  state.playing = !state.playing;
  if (state.playing && state.positionMs >= DURATION_MS) state.positionMs = 0;
  renderDock();
  if (state.playing) requestAnimationFrame(tick);
}
function seek(ms) { state.positionMs = Math.max(0, Math.min(DURATION_MS, ms)); updateNow(); }

// ---------- Building blocks ----------
const MODES = [['autopsia', 'Autopsia'], ['cifrado', 'Cifrado'], ['loopera', 'Loopera'], ['karaoke', 'Karaoke'], ['atril', 'Atril']];

function songTopbar() {
  const unconfirmed = HARMONY.normal.filter((r) => r.state !== 'confirmed').length;
  return `<header class="sp-topbar">
    <button class="sp-btn sp-btn--ghost" data-go="library" aria-label="Volver a la biblioteca">←</button>
    <div class="sp-topbar__song">
      <span class="sp-topbar__title">${esc(SONG.title)}</span>
      <span class="sp-topbar__meta">${SONG.key} · ${SONG.bpm} BPM · ${SONG.meter} · Guardado</span>
    </div>
    <nav class="sp-modes" aria-label="Modos de la canción">
      ${MODES.map(([id, label], index) => `<a href="#/cancion/demo/${id}" data-go="${id}" ${state.route === id ? 'aria-current="page"' : ''}><span class="sp-modes__step">${index + 1}</span>${label}</a>`).join('')}
    </nav>
    <div class="sp-topbar__end">
      <span class="sp-badge sp-badge--estimated">Cifrado estimado · ${unconfirmed} sin confirmar</span>
      ${state.route !== 'atril' ? `<button class="sp-btn sp-btn--ghost sp-btn--sm" data-action="toggle-inspector" aria-pressed="${state.inspectorOpen}">Panel</button>` : ''}
    </div>
  </header>`;
}

function guideOptions() {
  const options = [['mix', 'Mezcla original'], ['click', 'Clic']];
  if (state.stems.length) {
    options.splice(1, 0, ['no-vocals', 'Sin voz (karaoke)'], ['no-guitar', state.stems.includes('Guitarra') ? 'Sin guitarra' : 'Sin otros'], ['rhythm', 'Solo bajo y batería']);
  }
  if (state.samples.length) options.push(['looper', 'Mezcla de la loopera']);
  return options;
}

function renderDock() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  const guideLabel = audioMissing() ? 'Clic (falta el audio)' : guideOptions().find(([id]) => id === state.guide)?.[1] || 'Mezcla original';
  const isStage = state.route === 'atril';
  const isLooper = state.route === 'loopera';
  dock.innerHTML = `
    <div class="sp-dock__group">
      <button class="sp-btn sp-btn--lg" data-action="play" aria-label="${state.playing ? 'Pausar' : 'Reproducir'}">${state.playing ? '❚❚' : '▶'}</button>
      <span class="sp-dock__time" id="dock-time"><strong>${fmt(state.positionMs)}</strong> / ${fmt(DURATION_MS)}</span>
    </div>
    <div class="sp-dock__scrub"><input class="sp-range" type="range" id="dock-scrub" min="0" max="${DURATION_MS}" step="100" value="${Math.round(state.positionMs)}" aria-label="Posición"></div>
    <div class="sp-dock__group">
      ${isStage ? '' : `<button class="sp-btn sp-btn--sm" data-action="loop" aria-pressed="${state.loop}">A–B${state.route === 'karaoke' ? ' · Estribillo' : ''}</button>`}
      ${isStage ? '' : `<button class="sp-btn sp-btn--sm" data-popover="speed-pop">${state.speed.toFixed(2).replace('.', ',')}×${isLooper ? ' (cambia el tono)' : ''}</button>`}
      <button class="sp-btn sp-btn--sm" data-popover="guide-pop">🎧 ${esc(guideLabel)}</button>
      ${isStage ? '<button class="sp-btn sp-btn--sm" data-action="next-section">Siguiente sección</button><button class="sp-btn sp-btn--sm" data-action="fullscreen">Pantalla completa</button>'
        : '<button class="sp-btn sp-btn--sm" aria-pressed="false">Clic</button><button class="sp-btn sp-btn--sm" aria-pressed="false">Cuenta 1 compás</button>'}
    </div>
    <div class="sp-popover sp-fallback-closed" id="speed-pop" popover>
      <p class="sp-popover__title">Velocidad ${isLooper ? '(en la loopera cambia el tono)' : 'sin cambiar el tono'}</p>
      <div class="sp-popover__options">${[0.5, 0.75, 0.8, 1, 1.25].map((value) => `<label><input type="radio" name="speed" value="${value}" ${state.speed === value ? 'checked' : ''}> ${String(value).replace('.', ',')}×</label>`).join('')}</div>
    </div>
    <div class="sp-popover sp-fallback-closed" id="guide-pop" popover>
      <p class="sp-popover__title">Audio guía</p>
      <div class="sp-popover__options">${guideOptions().map(([id, label]) => `<label><input type="radio" name="guide" value="${id}" ${state.guide === id ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
        ${state.stems.length ? '' : '<p class="sp-muted">Separá las pistas en Autopsia para sumar guías sin voz o sin un instrumento.</p>'}</div>
    </div>`;
  wirePopovers(dock);
}

// Popover API where available; manual toggle otherwise (no CDN polyfill offline).
const hasPopover = 'popover' in HTMLElement.prototype;
function wirePopovers(scope) {
  scope.querySelectorAll('[data-popover]').forEach((trigger) => {
    const panel = scope.querySelector(`#${trigger.dataset.popover}`);
    if (hasPopover) panel.classList.remove('sp-fallback-closed');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => {
      const rect = trigger.getBoundingClientRect();
      panel.style.setProperty('--popover-left', `${Math.max(8, Math.min(rect.left, innerWidth - 240))}px`);
      panel.style.setProperty('--popover-bottom', `${innerHeight - rect.top + 8}px`);
      if (hasPopover) panel.togglePopover();
      else panel.classList.toggle('sp-fallback-closed');
    });
    if (hasPopover) panel.addEventListener('toggle', (event) => trigger.setAttribute('aria-expanded', String(event.newState === 'open')));
  });
}

function waveformPath(width = 800, height = 48, seed = 7) {
  let value = seed;
  const random = () => { value = (value * 9301 + 49297) % 233280; return value / 233280; };
  const bars = 160;
  let d = '';
  for (let index = 0; index < bars; index++) {
    const t = index / bars;
    const envelope = 0.35 + 0.55 * Math.abs(Math.sin(t * Math.PI * 4)) * (t > 0.5 && t < 0.875 ? 1 : 0.7);
    const amplitude = Math.max(0.08, envelope * (0.55 + random() * 0.45)) * (height / 2 - 2);
    const x = (index + 0.5) * (width / bars);
    d += `M${x.toFixed(1)} ${(height / 2 - amplitude).toFixed(1)}V${(height / 2 + amplitude).toFixed(1)}`;
  }
  return `<svg class="sp-wave" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke" fill="none"/></svg>`;
}

function chipTrack(list, { kind = 'chord' } = {}) {
  return list.map((item, index) => {
    const width = ((item.endMs - item.startMs) / DURATION_MS) * 100;
    if (kind === 'section') {
      return `<span class="sp-chip sp-chip--section" data-section="${item.id}" style="flex: 0 0 calc(${width}% - 2px)">${esc(item.label)}</span>`;
    }
    const stateLabel = item.state === 'confirmed' ? 'confirmado' : item.state === 'doubtful' ? 'dudoso' : 'automático';
    return `<button class="sp-chip" data-chord="${index}" data-state="${item.state}" aria-pressed="${state.selectedIndex === index}" style="flex: 0 0 calc(${width}% - 2px)">${esc(item.symbol)}<span class="sp-visually-hidden">, ${stateLabel}, ${fmt(item.startMs)}</span></button>`;
  }).join('');
}

function ticks() {
  return `<div class="sp-ticks" aria-hidden="true">${Array.from({ length: DURATION_MS / BEAT_MS }, (_, index) => `<span ${index % 4 === 0 ? 'data-bar' : ''}></span>`).join('')}</div>`;
}

function fretboard(symbol) {
  const shape = SHAPES[symbol] || SHAPES.C;
  const strings = 6, frets = 4, w = 220, h = 120, x0 = 24, y0 = 14, dx = (w - x0 - 10) / frets, dy = (h - y0 - 10) / (strings - 1);
  let svg = `<svg class="proto-fret" viewBox="0 0 ${w} ${h}" role="img" aria-label="Posición de ${esc(symbol)} en la guitarra">`;
  for (let s = 0; s < strings; s++) svg += `<line x1="${x0}" x2="${w - 10}" y1="${y0 + s * dy}" y2="${y0 + s * dy}" stroke="currentColor" stroke-width="1"/>`;
  for (let f = 0; f <= frets; f++) svg += `<line x1="${x0 + f * dx}" x2="${x0 + f * dx}" y1="${y0}" y2="${h - 10}" stroke="currentColor" stroke-width="${f === 0 ? 3 : 1}"/>`;
  [...shape].forEach((fret, index) => {
    const y = y0 + (strings - 1 - index) * dy;
    if (fret === 'x') svg += `<text x="10" y="${y + 4}" fill="currentColor" font-size="11" text-anchor="middle">×</text>`;
    else if (fret === '0') svg += `<circle cx="10" cy="${y}" r="4" fill="none" stroke="var(--color-harmony)" stroke-width="1.5"/>`;
    else svg += `<circle cx="${x0 + (Number(fret) - 0.5) * dx}" cy="${y}" r="7" fill="var(--color-harmony)"/>`;
  });
  return `${svg}</svg>`;
}

function chroma(symbol) {
  const tones = TONES[symbol] || TONES.C;
  const bars = NOTE_NAMES.map((_, pc) => (tones.includes(pc) ? (pc === tones[0] ? 1 : 0.72) : 0.08 + ((pc * 7) % 5) / 40));
  return `<div class="proto-chroma" aria-hidden="true">${bars.map((value) => `<span style="--h:${value.toFixed(2)}"></span>`).join('')}</div>
    <div class="proto-chroma-labels" aria-hidden="true">${NOTE_NAMES.map((name) => `<span>${name}</span>`).join('')}</div>
    <p class="sp-muted">Notas del acorde presentes en ${tones.length} de ${tones.length}; bajo en ${esc(symbol.includes('/') ? symbol.split('/')[1] : NOTE_NAMES[tones[0]])} el 72 % del tramo.</p>`;
}

// ---------- Screens ----------
function renderLibrary() {
  const empty = state.protoState === 'empty';
  const analyzing = state.protoState === 'analyzing' || state.analyzingProgress !== null;
  const progress = state.analyzingProgress ?? 0.45;
  app.innerHTML = `
    <header class="sp-topbar">
      <div class="sp-topbar__song"><span class="sp-topbar__title">StagePrompter</span><span class="sp-topbar__meta">Del audio al atril</span></div>
      <search class="sp-row" style="flex: 1; max-inline-size: 26rem"><label class="sp-visually-hidden" for="lib-search">Buscar</label><input id="lib-search" type="search" placeholder="Buscar canción o artista" style="flex: 1"></search>
      <div class="sp-topbar__end"><button class="sp-btn sp-btn--primary" data-action="new-from-audio">Nueva desde audio</button></div>
    </header>
    <main class="sp-library">
      ${analyzing ? `<section class="sp-banner" aria-live="polite"><div class="sp-progress" style="flex: 1; --value:${progress}">
          <strong>Analizando «mi-tema.mp3» · ${Math.round(progress * 100)} %</strong>
          <div class="sp-progress__bar"><div class="sp-progress__fill"></div></div>
          <span class="sp-muted">Pulsos y tempo listos · armonía en curso · después se abre en Autopsia.</span></div>
          <div class="sp-banner__actions"><button class="sp-btn sp-btn--sm" data-action="cancel-analysis">Cancelar</button></div></section>` : ''}
      <section class="sp-dropzone" aria-labelledby="drop-title">
        <span class="sp-dropzone__title" id="drop-title">${empty ? 'Empezá con un audio o un video' : 'Soltá un audio o video para analizarlo'}</span>
        <span>MP3, WAV, FLAC, M4A o video. Se analiza en tu computadora; nada se sube a internet.</span>
        <button class="sp-btn" data-action="new-from-audio">Elegir archivo</button>
      </section>
      ${empty ? `<div class="sp-empty"><p class="sp-empty__title">Tu biblioteca está vacía</p><p>Cada canción que cargues queda acá con su análisis, su cifrado y sus samples.</p></div>` : `
      <section class="sp-stack" aria-labelledby="songs-title">
        <div class="sp-row" style="justify-content: space-between">
          <h1 id="songs-title">Tus canciones</h1>
          <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Filtrar</legend>
            <label><input type="radio" name="filter" checked> Todas</label><label><input type="radio" name="filter"> Borradores</label><label><input type="radio" name="filter"> Revisadas</label>
          </fieldset>
        </div>
        <ul class="sp-list">
          <li class="sp-song"><div><div class="sp-song__title">${esc(SONG.title)}</div><div class="sp-song__meta">${esc(SONG.artist)} · C · 120 BPM · 0:32</div>
            <div class="sp-song__badges"><span class="sp-badge sp-badge--estimated">Cifrado estimado</span>${state.stems.length ? '<span class="sp-badge">Con pistas</span>' : ''}<span class="sp-badge sp-badge--loop">${state.samples.length} samples</span></div></div>
            <div class="sp-song__actions"><button class="sp-btn sp-btn--sm" data-go="autopsia">Abrir</button><button class="sp-btn sp-btn--sm" data-go="atril">Tocar</button></div></li>
          <li class="sp-song"><div><div class="sp-song__title">Tema en estudio</div><div class="sp-song__meta">Analizada hace 2 días · Am · 92 BPM</div>
            <div class="sp-song__badges"><span class="sp-badge sp-badge--estimated">Borrador</span><span class="sp-badge">12 acordes sin confirmar</span></div></div>
            <div class="sp-song__actions"><button class="sp-btn sp-btn--sm" data-go="autopsia">Abrir</button></div></li>
          <li class="sp-song"><div><div class="sp-song__title">Canción importada</div><div class="sp-song__meta">Formato anterior (sin tiempos)</div>
            <div class="sp-song__badges"><span class="sp-badge">v1</span></div></div>
            <div class="sp-song__actions"><button class="sp-btn sp-btn--sm" data-action="convert">Convertir</button></div></li>
        </ul>
      </section>`}
      <nav class="sp-row" aria-label="Más acciones"><button class="sp-btn sp-btn--ghost sp-btn--sm">Importar JSON o respaldo</button><button class="sp-btn sp-btn--ghost sp-btn--sm">Canción vacía</button><button class="sp-btn sp-btn--ghost sp-btn--sm">Almacenamiento · 184 MB</button><button class="sp-btn sp-btn--ghost sp-btn--sm">Descargar respaldo</button></nav>
    </main>`;
}

function renderWorkspace(canvasHtml, inspectorHtml, { stage = false } = {}) {
  const inspectorOpen = state.inspectorOpen && inspectorHtml;
  app.innerHTML = `${songTopbar()}
    <div class="sp-workspace" data-inspector="${inspectorOpen ? 'open' : 'closed'}">
      <main class="sp-canvas ${stage ? 'sp-canvas--stage' : ''}" id="canvas">${canvasHtml}</main>
      <aside class="sp-inspector" aria-label="Panel de detalles">${inspectorHtml || ''}</aside>
    </div>
    <footer class="sp-dock" id="dock"></footer>`;
  renderDock();
}

function renderAutopsia() {
  const list = regions();
  const selected = list[state.selectedIndex] || list[0];
  const changes = list.length - 1;
  const separating = state.protoState === 'separating' || state.separatingProgress !== null;
  const stemLanes = state.stems.map((name) => `<div class="sp-lane"><span class="sp-lane__label proto-stem-lane">${name}<button class="sp-btn sp-btn--sm sp-btn--ghost" aria-pressed="false" aria-label="Silenciar ${name}">M</button><button class="sp-btn sp-btn--sm sp-btn--ghost" aria-pressed="false" aria-label="Solo ${name}">S</button></span><div class="sp-lane__track sp-lane__track--flat">${waveformPath(800, 32, name.length * 11)}</div></div>`).join('');
  const canvas = `
    <div class="sp-row" style="justify-content: space-between; margin-block-end: var(--space-3)">
      <fieldset class="sp-row"><legend class="sp-eyebrow" style="float: inline-start; margin-inline-end: var(--space-2)">Sensibilidad de cambios</legend>
        <div class="sp-segmented">${['estable', 'normal', 'detallada'].map((id) => `<label><input type="radio" name="sensitivity" value="${id}" ${state.sensitivity === id ? 'checked' : ''}> ${id[0].toUpperCase()}${id.slice(1)}</label>`).join('')}</div>
      </fieldset>
      <span class="sp-muted">${changes} cambios · ${Math.round(changes / (DURATION_MS / 60000))} por minuto · tus acordes confirmados se mantienen</span>
    </div>
    ${separating ? `<div class="sp-banner" style="margin-block-end: var(--space-3)"><div class="sp-progress" style="flex: 1; --value:${state.separatingProgress ?? 0.3}"><strong>Separando pistas · ${Math.round((state.separatingProgress ?? 0.3) * 100)} %</strong><div class="sp-progress__bar"><div class="sp-progress__fill"></div></div><span class="sp-muted">Podés seguir estudiando mientras tanto.</span></div><div class="sp-banner__actions"><button class="sp-btn sp-btn--sm" data-action="cancel-separation">Cancelar</button></div></div>` : ''}
    <div class="sp-timeline" id="timeline" style="--progress:${pct(state.positionMs)}">
      <div class="sp-minimap" aria-hidden="true"><div class="sp-minimap__view" style="inset-inline-start: 0; inline-size: 100%"></div></div>
      <div class="sp-lane"><span class="sp-lane__label">Secciones</span><div class="sp-lane__track">${chipTrack(SECTIONS, { kind: 'section' })}</div></div>
      <div class="sp-lane"><span class="sp-lane__label">Acordes</span><div class="sp-lane__track" role="group" aria-label="Acordes detectados">${chipTrack(list)}</div></div>
      <div class="sp-lane"><span class="sp-lane__label">Pulsos</span><div class="sp-lane__track sp-lane__track--flat">${ticks()}</div></div>
      <div class="sp-lane"><span class="sp-lane__label">Onda · mezcla</span><div class="sp-lane__track sp-lane__track--flat">${waveformPath()}<div class="sp-selection" style="inset-inline-start:${pct(selected.startMs) * 100}%; inline-size:${pct(selected.endMs - selected.startMs) * 100}%"></div></div></div>
      ${state.lanes.stems ? stemLanes : ''}
      ${state.lanes.notes ? `<div class="sp-lane"><span class="sp-lane__label">Notas · bajo</span><div class="sp-lane__track sp-lane__track--flat">${waveformPath(800, 24, 3)}</div></div>` : ''}
      ${state.lanes.spectrum ? `<div class="sp-lane"><span class="sp-lane__label">Espectro</span><div class="sp-lane__track sp-lane__track--flat" style="min-block-size: 4rem">${waveformPath(800, 64, 5)}</div></div>` : ''}
      <div class="sp-playhead" aria-hidden="true"></div>
    </div>
    <div class="sp-add-lane" style="margin-block-start: var(--space-3)">
      ${state.stems.length ? `<button class="sp-btn sp-btn--sm sp-btn--ghost" data-lane="stems" aria-pressed="${state.lanes.stems}">${state.lanes.stems ? '−' : '+'} Pistas separadas (${state.stems.length})</button>` : '<button class="sp-btn sp-btn--sm sp-btn--ghost" data-action="separate">+ Separar pistas</button>'}
      <button class="sp-btn sp-btn--sm sp-btn--ghost" data-lane="notes" aria-pressed="${state.lanes.notes}">${state.lanes.notes ? '−' : '+'} Notas</button>
      <button class="sp-btn sp-btn--sm sp-btn--ghost" data-lane="spectrum" aria-pressed="${state.lanes.spectrum}">${state.lanes.spectrum ? '−' : '+'} Espectro</button>
    </div>`;
  const alternatives = ALTERNATIVES[selected.symbol] || [];
  const inspector = `
    <div class="sp-inspector__header"><span class="sp-eyebrow">Acorde · ${fmt(selected.startMs)}–${fmt(selected.endMs)}</span>
      <span class="sp-badge ${selected.state === 'confirmed' ? 'sp-badge--confirmed' : selected.state === 'doubtful' ? 'sp-badge--estimated' : ''}">${selected.state === 'confirmed' ? 'Confirmado' : selected.state === 'doubtful' ? 'Cambio dudoso' : 'Automático'}</span></div>
    <section class="sp-inspector__section">
      <p style="font-size: var(--text-2xl); font-weight: var(--weight-strong); color: var(--color-harmony)">${esc(selected.symbol)}</p>
      <div class="sp-row">${selected.state === 'confirmed' ? '' : '<button class="sp-btn sp-btn--primary sp-btn--sm" data-action="confirm">Confirmar</button>'}<button class="sp-btn sp-btn--sm">Dividir</button><button class="sp-btn sp-btn--sm">Unir con el siguiente</button></div>
      <button class="sp-btn sp-btn--ghost sp-btn--sm" style="justify-self: start">Aplicar a las 3 repeticiones</button>
    </section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">También podría ser</h2>
      <div class="sp-row">${alternatives.map(([symbol, reason]) => `<button class="sp-chip" title="${esc(reason)}">${esc(symbol)}<span class="sp-visually-hidden">, ${esc(reason)}</span></button><span class="sp-muted">${esc(reason)}</span>`).join('')}</div>
    </section>
    <section class="sp-inspector__section">
      <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Instrumento</legend>${['guitarra', 'bajo', 'piano'].map((id) => `<label><input type="radio" name="instrument" value="${id}" ${state.instrument === id ? 'checked' : ''}> ${id[0].toUpperCase()}${id.slice(1)}</label>`).join('')}</fieldset>
      ${fretboard(selected.symbol)}
    </section>
    <details class="sp-inspector__section"><summary class="sp-eyebrow" style="cursor: pointer">Ver evidencia</summary>${chroma(selected.symbol)}</details>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Con este tramo</h2>
      <div class="sp-stack"><button class="sp-btn" data-action="to-looper">Enviar a la Loopera</button><button class="sp-btn" data-action="update-chart">Actualizar cifrado</button>${state.stems.length ? '' : '<button class="sp-btn sp-btn--ghost" data-action="separate">Separar pistas…</button>'}</div>
    </section>`;
  renderWorkspace(canvas, inspector);
}

function renderSheetLine(line, { size } = {}) {
  const words = [];
  let offset = 0;
  for (const word of line.text.split(' ')) {
    const chord = line.chords.find(([at]) => at >= offset && at < offset + word.length + 1)?.[1] || '';
    const doubtful = chord && line.id === 'l3' && chord === 'G';
    words.push(`<span class="sp-word"><span class="sp-word__chord" ${doubtful ? 'data-state="doubtful"' : ''}>${esc(chord)}</span><span>${esc(word)}</span></span>`);
    offset += word.length + 1;
  }
  return words.join('');
}

function renderCifrado() {
  const sections = SECTIONS.map((section) => {
    const lines = LINES.filter((line) => line.section === section.id);
    const body = lines.length
      ? lines.map((line) => `<div class="sp-line" role="option" tabindex="0" data-line="${line.id}" aria-selected="${state.selectedLine === line.id}">${renderSheetLine(line)}</div>`).join('')
      : section.id === 'outro' ? `<pre class="sp-tab" tabindex="0"><code>${esc(TAB)}</code></pre>` : `<div class="sp-line"><span class="sp-word"><span class="sp-word__chord">C</span><span class="sp-muted">(instrumental)</span></span><span class="sp-word"><span class="sp-word__chord">Am</span><span></span></span></div>`;
    return `<section class="sp-sheet__section"><h2 class="sp-sheet__section-title">${esc(section.label)}<span>${fmt(section.startMs)}–${fmt(section.endMs)}</span></h2><div role="listbox" aria-label="Líneas de ${esc(section.label)}">${body}</div></section>`;
  }).join('');
  const line = LINES.find((item) => item.id === state.selectedLine) || LINES[0];
  const canvas = `
    <div class="sp-row" style="justify-content: space-between; margin-block-end: var(--space-4)">
      <div class="sp-row"><button class="sp-btn sp-btn--sm">Pegar letra</button><button class="sp-btn sp-btn--sm" aria-pressed="false">Tap de tiempos</button><button class="sp-btn sp-btn--sm sp-btn--ghost">Deshacer</button><button class="sp-btn sp-btn--sm sp-btn--ghost">Rehacer</button></div>
      <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Vista</legend><label><input type="radio" name="sheet-view" checked> Hoja</label><label><input type="radio" name="sheet-view"> Tabla</label></fieldset>
    </div>
    <div class="sp-lane" style="margin-block-end: var(--space-5)"><span class="sp-lane__label">Tiempo</span><div class="sp-lane__track">${chipTrack(SECTIONS, { kind: 'section' })}</div></div>
    <div class="sp-sheet">${sections}</div>`;
  const inspector = `
    <div class="sp-inspector__header"><span class="sp-eyebrow">Línea · ${esc(SECTIONS.find((s) => s.id === line.section).label)}</span></div>
    <section class="sp-inspector__section"><label class="sp-stack"><span class="sp-muted">Letra</span><input value="${esc(line.text)}"></label>
      <div class="sp-row"><label class="sp-stack" style="flex: 1"><span class="sp-muted">Empieza</span><input value="${fmt(line.startMs)},0"></label><label class="sp-stack" style="flex: 1"><span class="sp-muted">Termina</span><input value="${fmt(line.endMs)},0"></label></div>
      <button class="sp-btn sp-btn--sm" style="justify-self: start">Marcar con tap mientras suena</button></section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Acordes de la línea</h2><div class="sp-row">${line.chords.map(([, symbol]) => `<span class="sp-chip">${esc(symbol)}</span>`).join('')}</div><p class="sp-muted">Arrastrá un acorde sobre la palabra donde cae.</p></section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Sección</h2><label class="sp-row"><span class="sp-muted">Tonalidad</span><select><option>C</option><option>G</option><option>Am</option></select></label></section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Revisión</h2><p class="sp-muted">13 acordes automáticos sin confirmar. El cifrado queda como estimado hasta que lo declares revisado.</p><button class="sp-btn sp-btn--sm" style="justify-self: start">Declarar revisado</button></section>`;
  renderWorkspace(canvas, inspector);
}

function renderLoopera() {
  const pads = [...state.samples.map((sample) => `<button class="sp-pad" data-pad="${sample.id}" aria-pressed="${state.selectedPad === sample.id}"><span class="sp-pad__name">${esc(sample.name)}</span><span class="sp-pad__meta">${esc(sample.meta)}</span></button>`),
    ...Array.from({ length: Math.max(0, 8 - state.samples.length) }, (_, index) => `<button class="sp-pad" data-empty data-go="autopsia"><span class="sp-pad__name">${index === 0 ? 'Capturar' : 'Libre'}</span><span class="sp-pad__meta">${index === 0 ? 'Elegí un tramo en Autopsia' : ''}</span></button>`)].join('');
  const tracks = [['Guitarra', [[0, 2, 'Riff intro'], [4, 2, 'Riff intro']]], ['Batería', [[2, 4, 'Groove verso'], [6, 2, 'Groove verso']]], ['Bajo', [[4, 4, 'Bajo estribillo']]], ['Toma 1', state.recording ? [[4, 4, '● grabando…']] : []]];
  const canvas = `
    <div class="sp-row" style="justify-content: space-between; margin-block-end: var(--space-3)">
      <div class="sp-row"><button class="sp-btn sp-btn--record" data-action="record" aria-pressed="${state.recording}">${state.recording ? '● Grabando capa' : '● Grabar capa'} <span class="sp-kbd">R</span></button><button class="sp-btn sp-btn--sm" aria-pressed="true">Metrónomo</button><button class="sp-btn sp-btn--sm">Cuenta 1 compás</button></div>
      <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Cuantizar</legend><label><input type="radio" name="snap" checked> Compás</label><label><input type="radio" name="snap"> Pulso</label><label><input type="radio" name="snap"> Libre</label></fieldset>
    </div>
    ${hasMic() ? '' : '<div class="sp-banner sp-banner--warning" style="margin-block-end: var(--space-3)">Sin acceso al micrófono: podés tocar los pads y armar el arreglo, pero no grabar capas. <div class="sp-banner__actions"><button class="sp-btn sp-btn--sm">Reintentar</button></div></div>'}
    <h2 class="sp-eyebrow" style="margin-block-end: var(--space-2)">Pads · ${state.samples.length} samples</h2>
    <div class="sp-pads">${pads}</div>
    <h2 class="sp-eyebrow" style="margin-block: var(--space-5) var(--space-2)">Arreglo · 8 compases</h2>
    <div class="sp-arranger">${tracks.map(([name, clips]) => `<div class="sp-arranger__track"><span class="sp-lane__label">${name}</span><div class="sp-arranger__lane">${clips.map(([start, length, label]) => `<span class="sp-clip" style="grid-column: ${start + 1} / span ${length}">${esc(label)}</span>`).join('')}</div></div>`).join('')}</div>`;
  const sample = state.samples.find((item) => item.id === state.selectedPad) || state.samples[0];
  const inspector = sample ? `
    <div class="sp-inspector__header"><span class="sp-eyebrow">Sample</span><span class="sp-badge sp-badge--loop">Loop</span></div>
    <section class="sp-inspector__section"><p style="font-size: var(--text-lg); font-weight: var(--weight-strong)">${esc(sample.name)}</p><p class="sp-muted">${esc(sample.meta)} · compases ${sample.bars[0] + 1}–${sample.bars[1]}</p>
      <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Modo</legend><label><input type="radio" name="pad-mode" checked> Loop</label><label><input type="radio" name="pad-mode"> Una vez</label></fieldset>
      <label class="sp-stack"><span class="sp-muted">Ganancia</span><input type="range" min="0" max="100" value="80"></label></section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Exportar</h2><div class="sp-stack"><button class="sp-btn sp-btn--sm">Exportar WAV del sample</button><button class="sp-btn sp-btn--sm">Exportar mezcla WAV</button><button class="sp-btn sp-btn--sm sp-btn--ghost">Exportar MIDI</button></div><p class="sp-muted">Los WAV sirven para cargar en una loopera física o en tu DAW.</p></section>` : '';
  renderWorkspace(canvas, inspector);
}

function renderPrompter(profile) {
  const section = currentAt(SECTIONS, state.positionMs);
  const lineIndex = LINES.findIndex((line) => state.positionMs >= line.startMs && state.positionMs < line.endMs);
  const current = LINES[lineIndex] || null;
  const previous = lineIndex > 0 ? LINES[lineIndex - 1] : null;
  const next = lineIndex >= 0 ? LINES[lineIndex + 1] : LINES.find((line) => line.startMs > state.positionMs);
  const chord = currentAt(HARMONY.normal, state.positionMs);
  if (profile === 'atril') {
    const bars = [];
    for (let at = section.startMs; at < section.endMs; at += BAR_MS) bars.push(currentAt(HARMONY.normal, at + 1));
    const barIndex = Math.floor((state.positionMs - section.startMs) / BAR_MS);
    const beat = Math.floor((state.positionMs % BAR_MS) / BEAT_MS);
    return `
      ${audioMissing() ? '<div class="sp-banner sp-banner--warning" style="margin-block-end: var(--space-4)">Falta el audio de esta canción en este equipo: sigue el clic. Vinculalo desde Cifrado.</div>' : ''}
      <div class="sp-prompter" id="stage">
        <div class="sp-prompter__context"><strong style="color: var(--color-text)">${esc(section.label.toUpperCase())}</strong><span>Compás <span id="bar-no">${barIndex + 1}</span> de ${bars.length}</span><span style="margin-inline-start: auto" id="remaining">faltan ${fmt(DURATION_MS - state.positionMs)}</span></div>
        <div class="sp-bars">${bars.map((bar, index) => `<div class="sp-bar" data-bar-index="${index}" ${index === barIndex ? 'data-now' : ''}>${esc(bar.symbol)}</div>`).join('')}</div>
        <div class="sp-beats" aria-hidden="true">${[0, 1, 2, 3].map((index) => `<span ${index <= beat ? 'data-on' : ''}></span>`).join('')}</div>
        <p class="sp-prompter__line" data-role="current">${current ? renderSheetLine(current) : '<span class="sp-muted">(instrumental)</span>'}</p>
        <p class="sp-prompter__line" data-role="next">${next ? `Sigue: ${esc(next.text)}` : ''}</p>
      </div>`;
  }
  return `
    <div class="sp-prompter" id="stage">
      <div class="sp-prompter__context"><strong style="color: var(--color-text)">${esc(section.label.toUpperCase())}</strong><span>${state.loop ? 'repitiendo el estribillo' : 'ensayo'}</span><span>${state.speed.toFixed(2).replace('.', ',')}×</span></div>
      <p class="sp-prompter__line" data-role="previous">${previous ? esc(previous.text) : ''}</p>
      <p class="sp-prompter__line" data-role="current">${current ? renderSheetLine(current) : '<span class="sp-muted">(instrumental)</span>'}</p>
      <p class="sp-prompter__line" data-role="next">${next ? esc(next.text) : ''}</p>
      <div class="sp-row" aria-label="Acordes que vienen">${HARMONY.normal.filter((item) => item.endMs > state.positionMs).slice(0, 5).map((item) => `<span class="sp-chip" ${item === chord ? 'data-now' : ''}>${esc(item.symbol)}</span>`).join('')}</div>
    </div>`;
}

function liveView() {
  if (!hasMic()) {
    return `<div class="sp-banner sp-banner--danger">No hay acceso al micrófono. Revisá el permiso del sitio o elegí otro dispositivo; el karaoke sigue funcionando sin escucha.</div><button class="sp-btn sp-btn--sm" style="justify-self: start">Reintentar</button>`;
  }
  const chord = currentAt(HARMONY.normal, state.positionMs);
  const views = {
    cotejo: `<p class="sp-eyebrow">Esperado · escuchado</p><p style="font-size: var(--text-xl); font-weight: var(--weight-strong)"><span style="color: var(--color-harmony)">${esc(chord.symbol)}</span> · ${esc(chord.symbol)} <span style="color: var(--color-confirmed)">✓ coincide</span></p>
      <div class="sp-row"><div class="sp-stat"><span class="sp-stat__value">92 %</span><span class="sp-stat__label">ataques a tiempo</span></div><div class="sp-stat"><span class="sp-stat__value">+18 ms</span><span class="sp-stat__label">desvío medio</span></div></div>`,
    afinador: `<p style="font-size: var(--text-2xl); font-weight: var(--weight-strong)">A2 <span class="sp-muted">−6 cents</span></p><div class="proto-needle" style="--cents: -6"></div><p class="sp-muted">Nota sostenida estable · 110 Hz</p>`,
    radar: `<svg viewBox="0 0 160 160" role="img" aria-label="Radar armónico sobre el círculo de quintas"><circle cx="80" cy="80" r="62" fill="none" stroke="var(--color-border-strong)"/>${['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'].map((name, index) => { const angle = index / 12 * 2 * Math.PI - Math.PI / 2; const on = (TONES[chord.symbol] || []).includes(NOTE_NAMES.indexOf(name)); return `<text x="${80 + Math.cos(angle) * 72}" y="${84 + Math.sin(angle) * 72}" font-size="10" text-anchor="middle" fill="${on ? 'var(--color-harmony)' : 'var(--color-text-muted)'}">${name}</text>`; }).join('')}<polygon points="${(TONES[chord.symbol] || []).map((pc) => { const index = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'].indexOf(NOTE_NAMES[pc]); const angle = index / 12 * 2 * Math.PI - Math.PI / 2; return `${80 + Math.cos(angle) * 55},${80 + Math.sin(angle) * 55}`; }).join(' ')}" fill="rgb(129 229 218 / 0.25)" stroke="var(--color-harmony)"/></svg>`,
    espectro: waveformPath(300, 90, 13),
  };
  return `<div class="sp-meter" aria-label="Nivel del micrófono">${Array.from({ length: 12 }, (_, index) => `<span ${index < 7 ? 'data-on' : ''}></span>`).join('')}</div>
    <p class="sp-muted">Micrófono: señal buena · usá auriculares para no puntuar la pista</p>
    <fieldset class="sp-segmented"><legend class="sp-visually-hidden">Vista de escucha</legend>${['cotejo', 'afinador', 'radar', 'espectro'].map((id) => `<label><input type="radio" name="live-view" value="${id}" ${state.liveView === id ? 'checked' : ''}> ${id[0].toUpperCase()}${id.slice(1)}</label>`).join('')}</fieldset>
    <div class="sp-stack" id="live-view">${views[state.liveView]}</div>`;
}

function renderKaraoke() {
  const inspector = `
    <div class="sp-inspector__header"><span class="sp-eyebrow">Escucha en vivo</span></div>
    <section class="sp-inspector__section">${liveView()}</section>
    <section class="sp-inspector__section"><h2 class="sp-eyebrow">Práctica</h2><p class="sp-muted">Vuelta 2 de 4 del estribillo · mejor vuelta: 95 % a tiempo.</p></section>`;
  renderWorkspace(renderPrompter('karaoke'), inspector, { stage: true });
}

function renderAtril() {
  renderWorkspace(renderPrompter('atril'), '', { stage: true });
}

function updateNow() {
  const timeline = document.getElementById('timeline');
  if (timeline) timeline.style.setProperty('--progress', pct(state.positionMs));
  const time = document.getElementById('dock-time');
  if (time) time.innerHTML = `<strong>${fmt(state.positionMs)}</strong> / ${fmt(DURATION_MS)}`;
  const scrub = document.getElementById('dock-scrub');
  if (scrub && document.activeElement !== scrub) scrub.value = Math.round(state.positionMs);
  if (state.route === 'autopsia') {
    const index = regions().findIndex((item) => state.positionMs >= item.startMs && state.positionMs < item.endMs);
    document.querySelectorAll('[data-chord]').forEach((chip) => chip.toggleAttribute('data-now', Number(chip.dataset.chord) === index));
  }
  if (state.route === 'karaoke' || state.route === 'atril') {
    const stage = document.getElementById('stage');
    if (stage) {
      const fresh = document.createElement('div');
      fresh.innerHTML = renderPrompter(state.route);
      stage.replaceWith(fresh.querySelector('#stage'));
    }
  }
}

// ---------- Router and events ----------
function render() {
  document.body.style.overflow = '';
  if (state.route === 'library') renderLibrary();
  else ({ autopsia: renderAutopsia, cifrado: renderCifrado, loopera: renderLoopera, karaoke: renderKaraoke, atril: renderAtril })[state.route]();
  updateNow();
}

function go(route) {
  state.route = route;
  history.replaceState(null, '', route === 'library' ? '#/' : `#/cancion/demo/${route}`);
  render();
}

function simulateProgress(key, onDone) {
  state[key] = 0;
  const timer = setInterval(() => {
    state[key] = Math.min(1, state[key] + 0.12);
    render();
    if (state[key] >= 1) { clearInterval(timer); state[key] = null; onDone(); }
  }, 350);
  return timer;
}

let analysisTimer = null;
let separationTimer = null;
app.addEventListener('click', (event) => {
  const target = event.target.closest('button, a, [data-line]');
  if (!target) return;
  if (target.dataset.go) { event.preventDefault(); go(target.dataset.go); return; }
  if (target.dataset.chord) {
    state.selectedIndex = Number(target.dataset.chord);
    seek(regions()[state.selectedIndex].startMs);
    render();
    return;
  }
  if (target.dataset.line) { state.selectedLine = target.dataset.line; render(); return; }
  if (target.dataset.pad) { state.selectedPad = target.dataset.pad; render(); return; }
  if (target.dataset.lane) { state.lanes[target.dataset.lane] = !state.lanes[target.dataset.lane]; render(); return; }
  switch (target.dataset.action) {
    case 'play': togglePlay(); break;
    case 'toggle-inspector': state.inspectorOpen = !state.inspectorOpen; render(); break;
    case 'loop': state.loop = !state.loop; if (state.loop && state.route === 'karaoke') seek(16000); renderDock(); break;
    case 'next-section': { const next = SECTIONS.find((section) => section.startMs > state.positionMs); seek(next ? next.startMs : 0); break; }
    case 'fullscreen': document.documentElement.requestFullscreen?.().catch(() => toast('La pantalla completa no está disponible en esta vista previa.')); break;
    case 'confirm': regions()[state.selectedIndex].state = 'confirmed'; toast('Acorde confirmado: se mantiene aunque cambies la sensibilidad.'); render(); break;
    case 'to-looper': {
      const region = regions()[state.selectedIndex];
      state.samples.push({ id: `s${Date.now()}`, name: `${region.symbol} · ${fmt(region.startMs)}`, meta: `${(region.endMs - region.startMs) / BAR_MS} compás · ${state.stems.length ? 'pista elegida' : 'mezcla'}`, bars: [region.startMs / BAR_MS, region.endMs / BAR_MS] });
      toast(`Sample «${region.symbol} · ${fmt(region.startMs)}» agregado a la Loopera.`);
      render();
      break;
    }
    case 'update-chart': toast('Cifrado actualizado: la misma canción, 15 acordes (13 sin confirmar).'); break;
    case 'separate': document.getElementById('separate-dialog').showModal(); break;
    case 'cancel-separation': clearInterval(separationTimer); state.separatingProgress = null; if (state.protoState === 'separating') state.protoState = 'normal'; syncProtoSelect(); render(); toast('Separación cancelada.'); break;
    case 'new-from-audio':
      clearInterval(analysisTimer);
      analysisTimer = simulateProgress('analyzingProgress', () => { state.protoState = 'normal'; syncProtoSelect(); go('autopsia'); toast('Análisis listo: revisá los acordes y confirmá los que suenan bien.'); });
      break;
    case 'cancel-analysis': clearInterval(analysisTimer); state.analyzingProgress = null; state.protoState = 'normal'; syncProtoSelect(); render(); break;
    case 'record': if (!hasMic()) { toast('Sin micrófono no se puede grabar.'); break; } state.recording = !state.recording; render(); break;
    case 'convert': toast('Se convierte al formato nuevo y abre en Cifrado (sin tocar el original).'); break;
    default: break;
  }
});

app.addEventListener('change', (event) => {
  const { name, value } = event.target;
  if (name === 'sensitivity') { state.sensitivity = value; state.selectedIndex = Math.min(state.selectedIndex, regions().length - 1); render(); }
  else if (name === 'instrument') { state.instrument = value; }
  else if (name === 'live-view') { state.liveView = value; render(); }
  else if (name === 'speed') { state.speed = Number(value); renderDock(); }
  else if (name === 'guide') { state.guide = value; renderDock(); toast('Guía cambiada: sigue desde la misma posición.'); }
});
app.addEventListener('input', (event) => { if (event.target.id === 'dock-scrub') seek(Number(event.target.value)); });

document.getElementById('separate-dialog').addEventListener('close', (event) => {
  if (event.target.returnValue !== 'separate') return;
  const model = new FormData(event.target.querySelector('form')).get('model');
  clearInterval(separationTimer);
  separationTimer = simulateProgress('separatingProgress', () => {
    state.stems = model === '6' ? STEMS_6 : STEMS_4;
    state.lanes.stems = true;
    render();
    toast(`Pistas listas: ${state.stems.join(', ')}. Nuevas guías disponibles en el dock.`);
  });
});

function syncProtoSelect() { document.getElementById('proto-state').value = state.protoState; }
document.getElementById('proto-state').addEventListener('change', (event) => {
  state.protoState = event.target.value;
  if (state.protoState === 'empty' || state.protoState === 'analyzing') state.route = 'library';
  if (state.protoState === 'separating') state.route = 'autopsia';
  if (state.protoState === 'noMic') state.route = 'karaoke';
  if (state.protoState === 'noAudio') state.route = 'atril';
  go(state.route);
});

document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Space' && state.route !== 'library') { event.preventDefault(); togglePlay(); }
  const index = Number(event.key) - 1;
  if (index >= 0 && index < MODES.length && state.route !== 'library') go(MODES[index][0]);
  if (event.key.toLowerCase() === 'r' && state.route === 'loopera') { state.recording = !state.recording; render(); }
});

const initial = location.hash.match(/#\/cancion\/demo\/(\w+)/)?.[1];
go(MODES.some(([id]) => id === initial) ? initial : 'library');
