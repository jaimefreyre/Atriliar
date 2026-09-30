import { createDock } from './dock.js';
import { createLegacyHost } from './legacyHost.js';
import { renderInspector } from './inspectorHost.js';
import { routeTo } from './router.js';

const MODES = [
  ['autopsia', 'Autopsia'], ['cifrado', 'Cifrado'], ['loopera', 'Loopera'],
  ['karaoke', 'Karaoke'], ['multipista', 'Multipista'], ['atril', 'Atril'],
];

export function createAppShell(root, { onRoute, onLibrary } = {}) {
  root.innerHTML = '<div class="sp-app"><header class="sp-topbar"><a class="sp-topbar__brand" href="#/" aria-label="StagePrompter, biblioteca">StagePrompter <span class="sp-badge">E2b</span></a><nav class="sp-modes" aria-label="Vistas del proyecto"></nav><div class="sp-topbar__end"><button class="sp-btn sp-btn--sm sp-inspector-toggle" type="button" data-action="inspector" aria-pressed="true">Panel</button><span class="sp-badge" data-shell-status>Local</span></div></header><div class="sp-workspace" data-inspector="closed"><main class="sp-canvas" data-canvas tabindex="-1"></main><aside class="sp-inspector" data-inspector-panel hidden></aside></div><footer class="sp-dock" data-dock></footer></div>';
  const app = root.querySelector('.sp-app');
  const canvas = root.querySelector('[data-canvas]');
  const inspector = root.querySelector('[data-inspector-panel]');
  const workspace = root.querySelector('.sp-workspace');
  const nav = root.querySelector('.sp-modes');
  const frameHost = document.createElement('div'); frameHost.className = 'sp-frame-host';
  const libraryHost = document.createElement('div'); libraryHost.className = 'sp-library-host';
  canvas.append(libraryHost, frameHost);
  for (const [mode, label] of MODES) {
    const anchor = document.createElement('a');
    anchor.href = '#/'; anchor.dataset.mode = mode; anchor.textContent = label; anchor.hidden = true;
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.hash = routeTo({ name: 'song', songId: window.currentStagePrompterSongId || 'new', mode });
    });
    nav.append(anchor);
  }
  const host = createLegacyHost(frameHost, (route) => renderInspector(inspector, route, window.currentStagePrompterSong));
  const dock = createDock(root.querySelector('[data-dock]'), frameHost);
  root.querySelector('[data-action="inspector"]').addEventListener('click', (event) => {
    const visible = inspector.hidden;
    inspector.hidden = !visible;
    workspace.dataset.inspector = visible ? 'open' : 'closed';
    event.currentTarget.setAttribute('aria-pressed', String(visible));
  });
  const renderRoute = (route, { song = null } = {}) => {
    const isLibrary = route.name === 'library';
    libraryHost.hidden = !isLibrary; frameHost.hidden = isLibrary;
    for (const anchor of nav.querySelectorAll('a')) {
      anchor.hidden = isLibrary;
      anchor.href = routeTo({ name: 'song', songId: route.songId || 'new', mode: anchor.dataset.mode });
      if (!isLibrary && route.mode === anchor.dataset.mode) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    }
    root.querySelector('.sp-inspector-toggle').hidden = isLibrary;
    window.currentStagePrompterSongId = route.songId;
    window.currentStagePrompterSong = song;
    if (isLibrary) {
      host.unmount(); inspector.hidden = true; workspace.dataset.inspector = 'closed';
      onLibrary?.(libraryHost);
    } else {
      host.mount(route);
      const existing = Boolean(song);
      renderInspector(inspector, route, song);
      inspector.hidden = false; workspace.dataset.inspector = 'open';
      root.querySelector('.sp-inspector-toggle').setAttribute('aria-pressed', 'true');
      if (!existing && route.songId === 'new') app.dataset.projectState = 'new';
    }
    onRoute?.(route, { song, host, dock });
  };
  return { app, canvas, host, dock, renderRoute, libraryHost, frameHost };
}
