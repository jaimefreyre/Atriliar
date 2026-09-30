import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const { collectShellFiles } = createRequire(import.meta.url)('../../scripts/build-shell-manifest.cjs');
const ORIGIN = 'http://localhost:3000';

function createCacheStorage() {
  const stores = new Map();
  const keyOf = (request) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).pathname;
  const open = async (name) => {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        put: async (request, response) => { entries.set(keyOf(request), response); },
        match: async (request) => entries.get(keyOf(request))?.clone(),
        keys: async () => [...entries.keys()].map((pathname) => ({ url: ORIGIN + pathname })),
        addAll: async () => {},
      });
    }
    return stores.get(name);
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const store of stores.values()) {
        const hit = await store.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

async function loadServiceWorker({ online = true } = {}) {
  const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const handlers = {};
  const network = { online, requests: [] };
  const caches = createCacheStorage();
  const scope = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      network.requests.push(url);
      if (!network.online) throw new TypeError('Failed to fetch');
      return new Response(`body of ${new URL(url, ORIGIN).pathname}`, { status: 200 });
    },
    Response, URL, Blob, Promise, Set, Map, Error, TypeError, encodeURIComponent,
  };
  vm.createContext(scope);
  vm.runInContext(source, scope);
  return { handlers, network, caches, scope };
}

function extendableEvent() {
  const pending = [];
  return { pending, waitUntil: (promise) => pending.push(promise), settle: () => Promise.all(pending) };
}

function fetchEvent(path, { mode = 'no-cors' } = {}) {
  let responded = null;
  return {
    request: { url: ORIGIN + path, method: 'GET', mode },
    respondWith: (promise) => { responded = promise; },
    get responded() { return responded; },
  };
}

async function installed(options) {
  const sw = await loadServiceWorker(options);
  const install = extendableEvent();
  sw.handlers.install(install);
  await install.settle();
  return sw;
}

test('la instalación precachea todo el shell generado', async () => {
  const sw = await installed();
  const shellName = [...sw.caches.stores.keys()].find((name) => name.startsWith('stageprompter-shell-'));
  const cached = [...sw.caches.stores.get(shellName).entries.keys()].sort();
  assert.deepEqual(cached, [...collectShellFiles()].sort());
  assert.ok(cached.includes('/js/music/chromaMatch.js'));
});

test('con conexión responde desde la red (sin interfaz vieja) y refresca la copia offline', async () => {
  const sw = await installed();
  sw.network.requests.length = 0;
  const event = fetchEvent('/js/app.js');
  sw.handlers.fetch(event);
  const response = await event.responded;
  assert.equal(await response.text(), 'body of /js/app.js');
  assert.deepEqual(sw.network.requests, [`${ORIGIN}/js/app.js`]);
});

test('sin conexión la app se sirve desde la caché, y una navegación con query cae en "/"', async () => {
  const sw = await installed();
  sw.network.online = false;
  const moduleEvent = fetchEvent('/js/music/chromaMatch.js');
  sw.handlers.fetch(moduleEvent);
  assert.equal(await (await moduleEvent.responded).text(), 'body of /js/music/chromaMatch.js');
  const navigation = fetchEvent('/?ui=legacy', { mode: 'navigate' });
  sw.handlers.fetch(navigation);
  assert.equal(await (await navigation.responded).text(), 'body of /');
});

test('sin conexión, un archivo fuera del shell falla limpio en vez de devolver index.html', async () => {
  const sw = await installed();
  sw.network.online = false;
  const event = fetchEvent('/debug/transport-harness.html');
  sw.handlers.fetch(event);
  const response = await event.responded;
  assert.equal(response.type, 'error');
});

test('la API de separación y /health nunca pasan por la caché', async () => {
  const sw = await installed();
  for (const path of ['/api/separation/status', '/health']) {
    const event = fetchEvent(path);
    sw.handlers.fetch(event);
    assert.equal(event.responded, null, `${path} no debe interceptarse`);
  }
});
