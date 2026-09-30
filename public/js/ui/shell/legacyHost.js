const MODE_MAP = { autopsia: 'autopsy', cifrado: 'edit', karaoke: 'karaoke', multipista: 'stems', loopera: 'looper', atril: 'player' };

function makeUrl(route) {
  const query = new URLSearchParams();
  const isNew = route.songId === 'new';
  if (isNew) {
    query.set('action', ['cifrado', 'atril'].includes(route.mode) ? 'new-song' : 'new-audio');
    if (!['cifrado', 'atril'].includes(route.mode)) query.set('mode', MODE_MAP[route.mode] || 'autopsy');
  }
  else if (route.params?.get('v1') === '1') {
    query.set('action', 'edit-v1');
    query.set('songId', route.songId);
  } else if (route.mode === 'atril') {
    query.set('action', 'player');
    query.set('songId', route.songId);
  } else if (route.mode === 'cifrado') {
    query.set('action', 'edit');
    query.set('songId', route.songId);
  } else {
    query.set('action', 'lab');
    query.set('songId', route.songId);
    query.set('mode', MODE_MAP[route.mode] || 'autopsy');
  }
  if (new URLSearchParams(window.location.search).get('e2e') === '1') query.set('e2e', '1');
  return `legacy.html?${query}`;
}

export function createLegacyHost(container, inspector) {
  let iframe = null;
  let currentKey = '';
  let currentRoute = null;
  const unmount = () => {
    iframe?.remove(); iframe = null; currentKey = ''; container.replaceChildren();
    currentRoute = null;
    container.dispatchEvent(new CustomEvent('sp:frame', { detail: { iframe: null } }));
  };
  const mount = (route) => {
    const workspaceModes = new Set(['autopsia', 'karaoke', 'multipista', 'loopera']);
    if (iframe && currentRoute?.songId === 'new' && route.songId === 'new'
      && workspaceModes.has(currentRoute.mode) && workspaceModes.has(route.mode)) {
      currentRoute = route;
      iframe.contentWindow?.postMessage({ type: 'stageprompter:shell-mode', mode: MODE_MAP[route.mode] }, window.location.origin);
      inspector?.(route);
      return iframe;
    }
    const src = makeUrl(route);
    const key = `${src}`;
    if (iframe && currentKey === key) return iframe;
    unmount();
    iframe = document.createElement('iframe');
    iframe.className = 'sp-legacy-frame';
    iframe.title = `StagePrompter · ${route.mode || 'editor'}`;
    iframe.loading = 'eager';
    iframe.src = src;
    currentKey = key;
    currentRoute = route;
    container.replaceChildren(iframe);
    inspector?.(route);
    container.dispatchEvent(new CustomEvent('sp:frame', { detail: { iframe } }));
    return iframe;
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'stageprompter:legacy-close') return;
    window.location.hash = '#/';
  });
  return { mount, unmount, get iframe() { return iframe; } };
}
