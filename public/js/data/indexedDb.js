const DB_NAME = 'StagePrompterDB', DB_VERSION = 1, STORE_NAME = 'songs';
let dbPromise = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => { if (!e.target.result.objectStoreNames.contains(STORE_NAME)) e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }
  return dbPromise;
}
export async function saveSong(song) { const db = await getDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE_NAME, 'readwrite'); const req = tx.objectStore(STORE_NAME).put(song); req.onsuccess = () => res(); req.onerror = () => rej(req.error); }); }
export async function getAllSongs() { const db = await getDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE_NAME, 'readonly'); const req = tx.objectStore(STORE_NAME).getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
export async function deleteSong(id) { const db = await getDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE_NAME, 'readwrite'); const req = tx.objectStore(STORE_NAME).delete(id); req.onsuccess = () => res(); req.onerror = () => rej(req.error); }); }