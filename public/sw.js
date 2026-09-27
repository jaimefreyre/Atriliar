const SHELL_CACHE = 'stageprompter-shell-v4';
const SET_CACHE = 'stageprompter-set-assets-v1';
const TOOLS_CACHE = 'stageprompter-optional-tools-v1';
const SHELL = [
  '/', '/css/main.css', '/css/stage.css', '/css/prompter.css', '/css/evaluator.css', '/css/audio-draft.css',
  '/js/app.js', '/js/generated/validateSongV2.js', '/js/data/backup.js', '/js/data/indexedDb.js',
  '/js/data/importSongV2.js', '/js/data/offline.js',
  '/js/data/legacyImporter.js', '/js/data/reviewState.js', '/js/data/songSemantics.js', '/js/data/songValidator.js',
  '/js/music/harmony.js', '/js/music/notes.js', '/js/music/scales.js', '/js/music/transpose.js',
  '/js/rendering/chordDiagram.js', '/js/rendering/chordTracker.js', '/js/rendering/prompter.js',
  '/js/rendering/songRenderer.js', '/js/rendering/tabRenderer.js', '/js/stage/autoScroll.js',
  '/js/stage/inputActions.js', '/js/stage/stageMode.js', '/js/stage/wakeLock.js', '/js/state/session.js',
  '/js/timeline/grid.js', '/js/timeline/selectors.js', '/js/transport/audioTrack.js',
  '/js/transport/generatedBacking.js', '/js/transport/manual.js', '/js/transport/transport.js',
  '/js/ui/audioDraftAssistant.js', '/js/ui/calibrationEditor.js', '/js/ui/dom.js', '/js/ui/importDialog.js',
  '/js/ui/audioAnalysisVisualizer.js', '/js/ui/performanceEvaluator.js', '/js/ui/playerView.js', '/js/ui/videoSection.js',
  '/js/audio/chordTemplateMatch.js', '/js/audio/decodeLocalFile.js', '/js/audio/draftBuilder.js',
  '/js/audio/essentiaAnalysisWorker.js', '/js/audio/micCapture.js', '/js/audio/onsetMatcher.js',
  '/js/audio/onsetWorker.js', '/js/audio/segmentation.js', '/fixtures/songs/all-verses.json',
];
const OPTIONAL_TOOLS = ['/vendor/essentia/essentia.js-core.es.js', '/vendor/essentia/essentia-wasm.es.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('stageprompter-shell-') && key !== SHELL_CACHE
      || key.startsWith('stageprompter-set-assets-') && key !== SET_CACHE)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__stageprompter_asset/')) {
    event.respondWith(caches.open(SET_CACHE).then((cache) => cache.match(event.request)
      .then((cached) => cached || new Response('', { status: 404 }))));
    return;
  }
  if (url.pathname.startsWith('/vendor/essentia/')) {
    event.respondWith(caches.open(TOOLS_CACHE).then((cache) => cache.match(event.request)
      .then((cached) => cached || fetch(event.request))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && url.pathname.startsWith('/fixtures/')) {
      const copy = response.clone();
      caches.open(SET_CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })).catch(() => caches.match(new URL('/', self.location.origin))));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const reply = (value) => event.ports?.[0]?.postMessage(value);
  if (data.type === 'CACHE_AUDIO_ASSET' && data.id && data.blob instanceof Blob) {
    event.waitUntil(caches.open(SET_CACHE).then(async (cache) => {
      const url = `/__stageprompter_asset/${encodeURIComponent(data.id)}`;
      await cache.put(url, new Response(data.blob, { headers: { 'Content-Type': data.blob.type || 'application/octet-stream' } }));
      reply({ ok: true });
    }).catch((error) => reply({ ok: false, error: error.message })));
  } else if (data.type === 'CACHE_OPTIONAL_AUDIO_TOOLS') {
    event.waitUntil(caches.open(TOOLS_CACHE).then((cache) => cache.addAll(OPTIONAL_TOOLS))
      .then(() => reply({ ok: true })).catch((error) => reply({ ok: false, error: error.message })));
  }
});
