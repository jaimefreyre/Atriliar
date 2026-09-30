const DB_NAME = 'StagePrompterDB';
const DB_VERSION = 3;

const STORE_SONGS = 'songs';       // v1 legacy, contenido intacto
const STORE_SONGS_V2 = 'songsV2';
const STORE_ASSETS = 'assets';
const STORE_SETLISTS = 'setlists';
const STORE_SETTINGS = 'settings';
const STORE_LAB_PROJECTS = 'labProjects';

let dbPromise = null;

function notifyDbEvent(kind, message) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('stageprompter:db', { detail: { kind, message } }));
  }
  console.warn(`[IndexedDB] ${kind}: ${message}`);
}

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Solo crea stores acá; nunca migra datos dentro de onupgradeneeded.
      // Idempotente para oldVersion 0 (DB nueva) y 1 (solo tenía 'songs').
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_SONGS)) db.createObjectStore(STORE_SONGS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_SONGS_V2)) db.createObjectStore(STORE_SONGS_V2, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_SETLISTS)) db.createObjectStore(STORE_SETLISTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORE_LAB_PROJECTS)) db.createObjectStore(STORE_LAB_PROJECTS, { keyPath: 'id' });
      };

      request.onsuccess = (e) => {
        const db = e.target.result;
        // Otra pestaña quiere subir de versión: cerrar acá para no bloquearla.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
          notifyDbEvent('versionchange', 'La base de datos cambió en otra pestaña. Recargá esta página antes de guardar algo más.');
        };
        resolve(db);
      };

      request.onerror = (e) => reject(e.target.error);

      // Otra pestaña con una conexión vieja abierta impide la actualización.
      request.onblocked = () => {
        notifyDbEvent('blocked', 'Cerrá las otras pestañas de StagePrompter para poder actualizar la base de datos.');
      };
    });
  }
  return dbPromise;
}

/**
 * Abre una transacción sobre un solo store, ejecuta `fn(store)` de forma
 * síncrona (fn debe devolver el IDBRequest que emite, si emite alguno) y
 * resuelve recién cuando la TRANSACCIÓN completa (no cuando el request
 * individual tiene éxito) — así una escritura solo cuenta como guardada
 * tras el commit real.
 */
function runInStore(storeName, mode, fn) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    const request = fn(store);
    if (request && typeof request === 'object' && 'onsuccess' in request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    } else {
      result = request;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException('Transacción abortada', 'AbortError'));
  }));
}

/**
 * Como runInStore, pero para una escritura que abarca varios stores en UNA
 * sola transacción (p.ej. la canción y el asset de audio que referencia:
 * ninguna de las dos partes se guarda sin la otra). `writes` recibe el
 * mapa {storeName: IDBObjectStore} y no debe hacer ningún await.
 */
function runInStores(storeNames, mode, writes) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
    writes(stores);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException('Transacción abortada', 'AbortError'));
  }));
}

// --- v1 legacy (sin cambios de comportamiento) ---

export async function getAllSongs() {
  return runInStore(STORE_SONGS, 'readonly', s => s.getAll());
}
export async function saveSong(song) {
  return runInStore(STORE_SONGS, 'readwrite', s => s.put(song));
}
export async function deleteSong(id) {
  return runInStore(STORE_SONGS, 'readwrite', s => s.delete(id));
}

// --- v2 ---

export async function getAllSongsV2() {
  return runInStore(STORE_SONGS_V2, 'readonly', s => s.getAll());
}
/** @returns {Promise<object|undefined>} undefined si no existe (chequeo de colisión sin transacción de escritura abierta) */
export async function getSongV2(id) {
  return runInStore(STORE_SONGS_V2, 'readonly', s => s.get(id));
}
export async function saveSongV2(song) {
  return runInStore(STORE_SONGS_V2, 'readwrite', s => s.put(song));
}
export async function deleteSongV2(id) {
  return runInStore(STORE_SONGS_V2, 'readwrite', s => s.delete(id));
}

/**
 * Guarda la canción y su asset de audio en una única transacción atómica:
 * si falla cualquiera de las dos escrituras, ninguna queda comprometida
 * (nunca una canción referenciando un asset a medio guardar).
 * @param {object} song documento v2 ya validado, con `audio.assetId === asset.id`
 * @param {{id:string, blob:Blob, name:string, mime:string, bytes:number, duration:number}} asset
 */
export async function saveSongV2WithAsset(song, asset) {
  return runInStores([STORE_SONGS_V2, STORE_ASSETS], 'readwrite', (stores) => {
    stores[STORE_SONGS_V2].put(song);
    stores[STORE_ASSETS].put(asset);
  });
}

// --- assets (blobs de audio) ---

export async function getAsset(id) {
  return runInStore(STORE_ASSETS, 'readonly', s => s.get(id));
}
export async function saveAsset(asset) {
  if (!asset?.id || !(asset.blob instanceof Blob)) throw new TypeError('El asset necesita un id y un Blob.');
  return runInStore(STORE_ASSETS, 'readwrite', (store) => store.put(asset));
}
export async function deleteAsset(id) {
  return runInStore(STORE_ASSETS, 'readwrite', s => s.delete(id));
}

// --- proyectos del laboratorio (análisis y decisiones separados del SongDocument portable) ---
export async function getAllLabProjects() {
  return runInStore(STORE_LAB_PROJECTS, 'readonly', s => s.getAll());
}
export async function getLabProject(id) {
  return runInStore(STORE_LAB_PROJECTS, 'readonly', s => s.get(id));
}
export async function saveLabProject(project) {
  return runInStore(STORE_LAB_PROJECTS, 'readwrite', s => s.put(project));
}
export async function saveLabProjectWithAsset(project, asset) {
  return runInStores([STORE_LAB_PROJECTS, STORE_ASSETS], 'readwrite', (stores) => {
    stores[STORE_LAB_PROJECTS].put(project);
    stores[STORE_ASSETS].put(asset);
  });
}
export async function deleteLabProject(id) {
  const project = await getLabProject(id);
  if (!project) return;
  const assetId = project.audioAssetId;
  if (!assetId) return runInStore(STORE_LAB_PROJECTS, 'readwrite', s => s.delete(id));
  const [songs, projects] = await Promise.all([getAllSongsV2(), getAllLabProjects()]);
  const shared = songs.some((song) => song.audio?.assetId === assetId)
    || projects.some((other) => other.id !== id && other.audioAssetId === assetId);
  if (shared) return runInStore(STORE_LAB_PROJECTS, 'readwrite', s => s.delete(id));
  return runInStores([STORE_LAB_PROJECTS, STORE_ASSETS], 'readwrite', (stores) => {
    stores[STORE_LAB_PROJECTS].delete(id);
    stores[STORE_ASSETS].delete(assetId);
  });
}

// --- settings (preferencias, y hash de revisión local `review:<songId>`) ---

export async function getSetting(key) {
  const record = await runInStore(STORE_SETTINGS, 'readonly', s => s.get(key));
  return record ? record.value : undefined;
}
export async function saveSetting(key, value) {
  return runInStore(STORE_SETTINGS, 'readwrite', s => s.put({ key, value }));
}
