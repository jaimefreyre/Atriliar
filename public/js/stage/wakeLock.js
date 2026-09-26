let wakeLock = null;
export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.warn('Wake Lock no disponible:', err); }
  }
}
export async function releaseWakeLock() { if (wakeLock !== null) { await wakeLock.release(); wakeLock = null; } }