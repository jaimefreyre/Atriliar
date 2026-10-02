function clock(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

const MEDIA_SOURCE_CHANGED = 'stageprompter:active-media-changed';
const LAB_MEDIA_SELECTOR = '#audio-draft-assistant .lab-transport audio, #audio-draft-assistant .lab-transport video';
const MEDIA_EVENTS = ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'loadeddata', 'seeking', 'seeked', 'ended', 'emptied', 'volumechange'];

function findActiveMedia(iframe) {
  try {
    const document = iframe?.contentDocument;
    const assistant = document?.querySelector('#audio-draft-assistant');
    if (assistant) return assistant.querySelector(LAB_MEDIA_SELECTOR) || null;
    return document?.querySelector('audio, video') || null;
  } catch {
    return null;
  }
}

export function createDock(root, frameHost) {
  root.innerHTML = '<div class="sp-dock__group"><button class="sp-btn sp-btn--sm" type="button" data-dock="play" aria-label="Reproducir" disabled>▶</button><button class="sp-btn sp-btn--sm" type="button" data-dock="stop" aria-label="Detener" disabled>■</button></div><span class="sp-dock__time" aria-live="off"><strong data-dock="current">0:00</strong> / <span data-dock="duration">0:00</span></span><input class="sp-range sp-dock__scrub" data-dock="seek" type="range" min="0" max="0" value="0" aria-label="Posición de reproducción" disabled><div class="sp-dock__group sp-dock__volume-group"><button class="sp-btn sp-btn--sm" type="button" data-dock="mute" aria-label="Silenciar" aria-pressed="false" disabled>🔊</button><input class="sp-range sp-dock__volume" data-dock="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volumen" disabled></div><span class="sp-dock__hint" data-dock="hint">Abre una pista para activar el transporte.</span>';

  let activeMedia = null;
  let mediaListener = null;
  let animation = 0;
  let activeFrame = null;
  let frameLoadListener = null;
  let frameMessageListener = null;
  let framePlayListener = null;
  const play = root.querySelector('[data-dock="play"]');
  const stop = root.querySelector('[data-dock="stop"]');
  const seek = root.querySelector('[data-dock="seek"]');
  const mute = root.querySelector('[data-dock="mute"]');
  const volume = root.querySelector('[data-dock="volume"]');
  const current = root.querySelector('[data-dock="current"]');
  const duration = root.querySelector('[data-dock="duration"]');
  const hint = root.querySelector('[data-dock="hint"]');

  function render() {
    if (!activeMedia) {
      current.textContent = '0:00'; duration.textContent = '0:00'; seek.value = '0'; seek.max = '0';
      play.textContent = '▶'; play.setAttribute('aria-label', 'Reproducir');
      mute.textContent = '🔊'; mute.setAttribute('aria-label', 'Silenciar'); mute.setAttribute('aria-pressed', 'false');
      volume.value = '1';
      return;
    }
    const currentTime = Number.isFinite(activeMedia.currentTime) ? activeMedia.currentTime : 0;
    const durationSeconds = Number.isFinite(activeMedia.duration) ? activeMedia.duration : 0;
    current.textContent = clock(currentTime);
    duration.textContent = clock(durationSeconds);
    seek.max = String(durationSeconds);
    if (document.activeElement !== seek) seek.value = String(Math.min(currentTime, durationSeconds || currentTime));
    play.textContent = activeMedia.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', activeMedia.paused ? 'Reproducir' : 'Pausar');
    const isMuted = activeMedia.muted || activeMedia.volume <= 0;
    mute.textContent = isMuted ? '🔇' : '🔊';
    mute.setAttribute('aria-label', isMuted ? 'Activar sonido' : 'Silenciar');
    mute.setAttribute('aria-pressed', String(isMuted));
    if (document.activeElement !== volume) volume.value = String(activeMedia.volume);
  }

  function refresh() {
    render();
    if (activeMedia && !activeMedia.paused && !animation) animation = requestAnimationFrame(tick);
    else if ((!activeMedia || activeMedia.paused) && animation) {
      cancelAnimationFrame(animation);
      animation = 0;
    }
  }

  function tick() {
    animation = 0;
    render();
    if (activeMedia && !activeMedia.paused) animation = requestAnimationFrame(tick);
  }

  function setMedia(media) {
    if (activeMedia === media) { refresh(); return; }
    if (animation) { cancelAnimationFrame(animation); animation = 0; }
    if (activeMedia && mediaListener) {
      MEDIA_EVENTS.forEach((eventName) => activeMedia.removeEventListener(eventName, mediaListener));
      activeMedia.pause();
    }
    activeMedia = media;
    mediaListener = null;
    const enabled = Boolean(media);
    [play, stop, seek, mute, volume].forEach((node) => { node.disabled = !enabled; });
    hint.textContent = enabled ? 'Reproduce y busca en la pista activa.' : 'Abre una pista para activar el transporte.';
    if (media) {
      mediaListener = refresh;
      MEDIA_EVENTS.forEach((eventName) => media.addEventListener(eventName, mediaListener));
    }
    refresh();
  }

  play.addEventListener('click', async () => {
    if (!activeMedia) return;
    if (activeMedia.paused) await activeMedia.play().catch(() => {});
    else activeMedia.pause();
    refresh();
  });
  stop.addEventListener('click', () => {
    if (!activeMedia) return;
    activeMedia.pause();
    try { activeMedia.currentTime = 0; } catch { /* El medio aún puede no haber cargado metadatos. */ }
    refresh();
  });
  seek.addEventListener('input', () => {
    if (!activeMedia || !Number.isFinite(activeMedia.duration)) return;
    try { activeMedia.currentTime = Math.max(0, Math.min(activeMedia.duration, Number(seek.value) || 0)); } catch { /* El medio puede estar cambiando de fuente. */ }
    refresh();
  });
  mute.addEventListener('click', () => {
    if (!activeMedia) return;
    activeMedia.muted = !activeMedia.muted;
    refresh();
  });
  volume.addEventListener('input', () => {
    if (!activeMedia) return;
    activeMedia.volume = Math.max(0, Math.min(1, Number(volume.value)));
    if (activeMedia.volume > 0) activeMedia.muted = false;
    refresh();
  });
  window.addEventListener('pagehide', () => activeMedia?.pause());

  function attach(iframe) {
    if (activeFrame && frameLoadListener) activeFrame.removeEventListener('load', frameLoadListener);
    if (frameMessageListener) window.removeEventListener('message', frameMessageListener);
    if (framePlayListener) {
      try { activeFrame?.contentDocument?.removeEventListener('play', framePlayListener, true); } catch { /* frame de otro origen */ }
    }
    activeFrame = iframe || null;
    frameLoadListener = null;
    frameMessageListener = null;
    framePlayListener = null;
    setMedia(null);
    if (!activeFrame) return;

    const frame = activeFrame;
    let attempts = 0;
    const find = () => {
      if (!frame.isConnected || frame !== activeFrame) return;
      const media = findActiveMedia(frame);
      if (media) { setMedia(media); return; }
      if (++attempts < 25) window.setTimeout(find, 300);
    };
    frameLoadListener = find;
    frame.addEventListener('load', frameLoadListener);
    frameMessageListener = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.type !== MEDIA_SOURCE_CHANGED) return;
      attempts = 0;
      setMedia(findActiveMedia(frame));
    };
    window.addEventListener('message', frameMessageListener);
    framePlayListener = (event) => {
      if (event.target?.tagName === 'AUDIO' || event.target?.tagName === 'VIDEO') setMedia(event.target);
    };
    try { frame.contentDocument?.addEventListener('play', framePlayListener, true); } catch { /* frame de otro origen */ }
    if (frame.contentDocument?.readyState === 'complete') find();
  }

  frameHost.addEventListener('sp:frame', (event) => attach(event.detail?.iframe));
  return { setMedia };
}
