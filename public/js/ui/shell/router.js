export const ROUTE_MODES = ['autopsia', 'cifrado', 'loopera', 'karaoke', 'atril', 'multipista'];

export function parseRoute(hash = window.location.hash) {
  const raw = String(hash || '#/').replace(/^#/, '') || '/';
  const url = new URL(raw, 'http://stageprompter.local');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'cancion' || !parts[1]) return { name: 'library', mode: null, songId: null, params: url.searchParams };
  const mode = ROUTE_MODES.includes(parts[2]) ? parts[2] : 'autopsia';
  return { name: 'song', songId: decodeURIComponent(parts[1]), mode, params: url.searchParams };
}

export function routeTo(route) {
  if (!route || route.name === 'library') return '#/';
  const id = encodeURIComponent(route.songId || 'new');
  const mode = ROUTE_MODES.includes(route.mode) ? route.mode : 'autopsia';
  return `#/cancion/${id}/${mode}${route.query ? `?${new URLSearchParams(route.query)}` : ''}`;
}

export function subscribeRoute(callback) {
  const update = () => callback(parseRoute());
  window.addEventListener('hashchange', update);
  update();
  return () => window.removeEventListener('hashchange', update);
}
