async function sendWorkerMessage(type, payload = {}) {
  if (!('serviceWorker' in navigator)) return { ok: false, error: 'Service Worker no disponible' };
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) return { ok: false, error: 'Service Worker no activo' };
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: 'Tiempo de espera agotado' }), 15000);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timeout); resolve(data); };
    worker.postMessage({ type, ...payload }, [channel.port2]);
  });
}

export async function initializeOffline(onStatus = () => {}) {
  if (!('serviceWorker' in navigator)) {
    onStatus('Modo sin conexión no disponible en este navegador.');
    return { supported: false };
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const persisted = await navigator.storage?.persist?.().catch(() => false) ?? false;
    const estimate = await navigator.storage?.estimate?.().catch(() => null) ?? null;
    const used = estimate?.usage;
    const quota = estimate?.quota;
    const usage = Number.isFinite(used) && Number.isFinite(quota)
      ? ` Almacenamiento local: ${formatBytes(used)} de ${formatBytes(quota)}.`
      : '';
    onStatus(`App preparada sin conexión; canciones y audio guardados localmente. Las herramientas de análisis se descargan al abrir el asistente con conexión.${persisted ? ' El navegador concedió persistencia.' : ' El navegador puede limpiar datos locales si necesita espacio.'}${usage}`);
    return { supported: true, persisted, estimate };
  } catch (error) {
    onStatus(`No se pudo preparar el modo sin conexión: ${error.message}`);
    return { supported: false, error };
  }
}

export function cacheOptionalAudioTools() {
  return sendWorkerMessage('CACHE_OPTIONAL_AUDIO_TOOLS');
}

export function cacheSongAudioAsset(asset) {
  if (!asset?.id || !(asset.blob instanceof Blob)) return Promise.resolve({ ok: false, error: 'Asset local inválido' });
  return sendWorkerMessage('CACHE_AUDIO_ASSET', { id: asset.id, blob: asset.blob });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
