const POSITION_KEY = 'stageprompter:shell-position:v1';

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function createDock(root, frameHost) {
  root.innerHTML = '<div class="sp-dock__group"><button class="sp-btn sp-btn--sm" type="button" data-dock="play" aria-label="Reproducir" disabled>▶</button><button class="sp-btn sp-btn--sm" type="button" data-dock="stop" aria-label="Detener" disabled>■</button></div><span class="sp-dock__time" aria-live="off"><strong data-dock="current">0:00</strong> / <span data-dock="duration">0:00</span></span><input class="sp-range sp-dock__scrub" data-dock="seek" type="range" min="0" max="0" value="0" aria-label="Posición de reproducción" disabled><span class="sp-dock__hint" data-dock="hint">Abre una pista para activar el transporte.</span>';
  let activeMedia = null;
  let animation = 0;
  const play = root.querySelector('[data-dock="play"]');
  const stop = root.querySelector('[data-dock="stop"]');
  const seek = root.querySelector('[data-dock="seek"]');
  const current = root.querySelector('[data-dock="current"]');
  const duration = root.querySelector('[data-dock="duration"]');
  const hint = root.querySelector('[data-dock="hint"]');
  const update = () => {
    if (!activeMedia) return;
    current.textContent = clock(activeMedia.currentTime);
    duration.textContent = clock(activeMedia.duration);
    seek.max = String(Number.isFinite(activeMedia.duration) ? activeMedia.duration : 0);
    seek.value = String(activeMedia.currentTime || 0);
    play.textContent = activeMedia.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', activeMedia.paused ? 'Reproducir' : 'Pausar');
    if (!activeMedia.paused) animation = requestAnimationFrame(update);
  };
  const setMedia = (media) => {
    if (activeMedia === media) return;
    if (animation) cancelAnimationFrame(animation);
    activeMedia = media;
    const enabled = !!media;
    [play, stop, seek].forEach((node) => { node.disabled = !enabled; });
    hint.textContent = enabled ? 'El transporte controla el audio del panel activo.' : 'Abre una pista para activar el transporte.';
    if (media) {
      try {
        const saved = Number(sessionStorage.getItem(POSITION_KEY));
        if (Number.isFinite(saved) && saved > 0 && media.readyState > 0) media.currentTime = Math.min(saved, media.duration || saved);
      } catch { /* almacenamiento de sesión opcional */ }
      ['play', 'pause', 'timeupdate', 'durationchange', 'seeked', 'ended'].forEach((eventName) => media.addEventListener(eventName, update));
      update();
    } else {
      current.textContent = '0:00'; duration.textContent = '0:00'; seek.value = '0'; seek.max = '0'; play.textContent = '▶';
    }
  };
  play.addEventListener('click', async () => {
    if (!activeMedia) return;
    if (activeMedia.paused) await activeMedia.play().catch(() => {});
    else activeMedia.pause();
    update();
  });
  stop.addEventListener('click', () => { if (activeMedia) { activeMedia.pause(); activeMedia.currentTime = 0; update(); } });
  seek.addEventListener('input', () => { if (activeMedia) { activeMedia.currentTime = Number(seek.value); update(); } });
  window.addEventListener('pagehide', () => {
    if (!activeMedia) return;
    try { sessionStorage.setItem(POSITION_KEY, String(activeMedia.currentTime || 0)); } catch { /* opcional */ }
    activeMedia.pause();
  });
  const attach = (iframe) => {
    setMedia(null);
    if (!iframe) return;
    iframe.addEventListener('load', () => {
      let attempts = 0;
      const find = () => {
        try {
          const media = iframe.contentDocument?.querySelector('audio, video');
          if (media) { setMedia(media); return; }
        } catch { /* el panel podría navegar fuera del mismo origen */ }
        if (++attempts < 25 && iframe.isConnected) window.setTimeout(find, 300);
      };
      find();
    }, { once: true });
  };
  frameHost.addEventListener('sp:frame', (event) => attach(event.detail?.iframe));
  return { setMedia };
}
