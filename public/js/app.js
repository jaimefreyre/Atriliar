import { createAppShell } from './ui/shell/appShell.js';
import { createLibraryView } from './ui/library/libraryView.js';
import { installKeymap } from './ui/shell/keymap.js';
import { parseRoute, routeTo, subscribeRoute } from './ui/shell/router.js';
import { getSongV2 } from './data/indexedDb.js';
import { initializeOffline } from './data/offline.js';
import { showAlert, showToast } from './ui/components/dialogs.js';

if (new URLSearchParams(window.location.search).get('ui') === 'legacy') {
  window.location.replace('legacy.html');
} else {
  try { localStorage.setItem('ui:shell', 'true'); } catch { /* El shell sigue disponible sin almacenamiento de preferencias. */ }

  const root = document.getElementById('app-root');
  const shell = createAppShell(root);
  const library = createLibraryView(shell.libraryHost, { navigate: (route) => { window.location.hash = routeTo(route); } });
  if (new URLSearchParams(window.location.search).get('e2e') !== '1') {
    initializeOffline((message) => {
      const status = root.querySelector('[data-shell-status]');
      if (status) status.textContent = message.startsWith('App preparada') ? 'Sin conexión lista' : 'Local';
    });
  }
  let currentRoute = parseRoute();

  async function displayRoute(route) {
    currentRoute = route;
    const song = route.name === 'song' && route.songId !== 'new' ? await getSongV2(route.songId).catch(() => null) : null;
    shell.renderRoute(route, { song });
    if (route.name === 'library') await library.refresh();
  }

  subscribeRoute(displayRoute);
  installKeymap((mode) => {
    const songId = currentRoute.name === 'song' ? currentRoute.songId : 'new';
    window.location.hash = routeTo({ name: 'song', songId, mode });
  }, () => { window.location.hash = '#/'; });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'stageprompter:library-updated') library.refresh();
    if (event.data?.type === 'stageprompter:project-ready' && currentRoute.name === 'song' && currentRoute.songId === 'new' && event.data.songId) {
      window.location.hash = routeTo({ name: 'song', songId: event.data.songId, mode: currentRoute.mode });
    }
  });
  window.addEventListener('stageprompter:db', (event) => {
    if (event.detail?.kind === 'reset') showToast(event.detail.message, { kind: 'info', duration: 7000 });
    else showToast(event.detail?.message || 'La base local cambió en otra pestaña.', { kind: 'warning', duration: 7000 });
  });
  window.addEventListener('error', (event) => showToast(event.message || 'Error inesperado en la interfaz.', { kind: 'danger', duration: 7000 }));
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || 'Error inesperado.');
    showAlert('No se pudo completar la acción', message);
  });
}
