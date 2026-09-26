let wakeLock = null;

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  if (wakeLock && !wakeLock.released) return true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
    return true;
  } catch (err) {
    console.warn('Wake Lock no disponible:', err);
    wakeLock = null;
    return false;
  }
}

export async function releaseWakeLock() {
  const activeLock = wakeLock;
  wakeLock = null;
  if (activeLock && !activeLock.released) await activeLock.release();
}
