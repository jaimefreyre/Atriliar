// @generated-shell-begin (npm run build:shell; no editar a mano)
const SHELL_CACHE = 'stageprompter-shell-399a58c4cde4';
const SHELL = [
  '/',
  '/legacy.html',
  '/css/audio-draft.css',
  '/css/components.css',
  '/css/dialogs.css',
  '/css/evaluator.css',
  '/css/main.css',
  '/css/prompter.css',
  '/css/stage.css',
  '/css/tokens.css',
  '/fixtures/songs/all-verses.json',
  '/js/app.js',
  '/js/audio/analysisPipeline.js',
  '/js/audio/audio-worklet-processor.js',
  '/js/audio/auditionRange.js',
  '/js/audio/beatGrid.js',
  '/js/audio/chordTemplateMatch.js',
  '/js/audio/chromaSimilarity.js',
  '/js/audio/decodeLocalFile.js',
  '/js/audio/draftBuilder.js',
  '/js/audio/essentiaAnalysisWorker.js',
  '/js/audio/frameClock.js',
  '/js/audio/labComposition.js',
  '/js/audio/liveHarmonyWorker.js',
  '/js/audio/livePitchTracker.js',
  '/js/audio/loopEditing.js',
  '/js/audio/loopRecording.js',
  '/js/audio/micCapture.js',
  '/js/audio/midiFile.js',
  '/js/audio/midiVoices.js',
  '/js/audio/onsetMatcher.js',
  '/js/audio/onsetWorker.js',
  '/js/audio/pitchTuner.js',
  '/js/audio/segmentation.js',
  '/js/audio/silenceGate.js',
  '/js/audio/waveformEnvelope.js',
  '/js/data/backup.js',
  '/js/data/chartSync.js',
  '/js/data/importSongV2.js',
  '/js/data/indexedDb.js',
  '/js/data/legacyImporter.js',
  '/js/data/offline.js',
  '/js/data/projectModel.js',
  '/js/data/projectRepo.js',
  '/js/data/reviewState.js',
  '/js/data/songSemantics.js',
  '/js/data/songValidator.js',
  '/js/generated/validateSongV2.js',
  '/js/harmony/analysisHarmony.js',
  '/js/harmony/chordDecoder.js',
  '/js/harmony/chordRefinement.js',
  '/js/harmony/chordVocabulary.js',
  '/js/harmony/chromaFrontEnd.js',
  '/js/harmony/fft.js',
  '/js/harmony/harmonyMetrics.js',
  '/js/harmony/harmonySteps.js',
  '/js/harmony/harmonyTrack.js',
  '/js/harmony/keyProfile.js',
  '/js/harmony/labFormat.js',
  '/js/harmony/liveChordTracker.js',
  '/js/harmony/nnlsChroma.js',
  '/js/harmony/synthProgression.js',
  '/js/legacyApp.js',
  '/js/music/harmony.js',
  '/js/music/notes.js',
  '/js/music/scales.js',
  '/js/music/transpose.js',
  '/js/rendering/bassFretboard.js',
  '/js/rendering/chordDiagram.js',
  '/js/rendering/chordTracker.js',
  '/js/rendering/prompter.js',
  '/js/rendering/songRenderer.js',
  '/js/rendering/tabRenderer.js',
  '/js/stage/autoScroll.js',
  '/js/stage/inputActions.js',
  '/js/stage/stageMode.js',
  '/js/stage/wakeLock.js',
  '/js/state/session.js',
  '/js/timeline/grid.js',
  '/js/timeline/selectors.js',
  '/js/transport/audioTrack.js',
  '/js/transport/generatedBacking.js',
  '/js/transport/manual.js',
  '/js/transport/transport.js',
  '/js/ui/audioAnalysisVisualizer.js',
  '/js/ui/audioDraftAssistant.js',
  '/js/ui/calibrationEditor.js',
  '/js/ui/components/dialogs.js',
  '/js/ui/dom.js',
  '/js/ui/harmonicCircle.js',
  '/js/ui/importDialog.js',
  '/js/ui/library/libraryView.js',
  '/js/ui/multitrackWorkspace.js',
  '/js/ui/performanceEvaluator.js',
  '/js/ui/playerView.js',
  '/js/ui/shell/appShell.js',
  '/js/ui/shell/dock.js',
  '/js/ui/shell/inspectorHost.js',
  '/js/ui/shell/keymap.js',
  '/js/ui/shell/legacyHost.js',
  '/js/ui/shell/router.js',
  '/js/ui/videoSection.js',
];
// @generated-shell-end
const SET_CACHE = 'stageprompter-set-assets-v1';
const TOOLS_CACHE = 'stageprompter-optional-tools-v1';
const OPTIONAL_TOOLS = ['/vendor/essentia/essentia.js-core.es.js', '/vendor/essentia/essentia-wasm.es.js'];
const SHELL_PATHS = new Set(SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async (cache) => {
    await Promise.all(SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`No se pudo actualizar el recurso de la app: ${url}`);
      await cache.put(url, response);
    }));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('stageprompter-shell-') && key !== SHELL_CACHE
      || key.startsWith('stageprompter-set-assets-') && key !== SET_CACHE)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

// Network first for the app's own files: online you always run the code the
// server has (no stale UI while developing); offline the precached snapshot
// takes over. Only files in SHELL are written back, so the cache stays bounded.
function networkFirst(request, pathname) {
  return fetch(request).then((response) => {
    if (response.ok && SHELL_PATHS.has(pathname)) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(pathname, copy)).catch(() => {});
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request.mode === 'navigate' ? '/' : pathname);
    return cached || Response.error();
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return;
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
  event.respondWith(networkFirst(event.request, url.pathname));
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
