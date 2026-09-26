let animationFrameId = null;
let startTime = 0;
let pixelsPerSecond = 16;
let isRunning = false;
let scrollPosition = 0;

export function setScrollSpeed(bpm, pixelsPerBeat) {
  pixelsPerSecond = (bpm / 60) * pixelsPerBeat;
  console.log(`🎵 Scroll speed: ${pixelsPerSecond} px/s (BPM: ${bpm})`);
}

function scrollStep() {
  if (!isRunning) return;
  
  const now = performance.now();
  const elapsed = (now - startTime) / 1000;
  
  // Calcular posición absoluta basada en tiempo transcurrido
  scrollPosition = elapsed * pixelsPerSecond;
  
  // Usar scrollTo con valor absoluto (más confiable que scrollBy)
  window.scrollTo(0, Math.floor(scrollPosition));
  
  animationFrameId = requestAnimationFrame(scrollStep);
}

export function startAutoScroll() {
  if (isRunning) return;
  isRunning = true;
  startTime = performance.now();
  scrollPosition = window.scrollY;
  
  // Ajustar startTime para que empiece desde la posición actual
  startTime = performance.now() - (scrollPosition / pixelsPerSecond * 1000);
  
  console.log('▶️ AutoScroll iniciado');
  animationFrameId = requestAnimationFrame(scrollStep);
}

export function stopAutoScroll() {
  console.log('⏸️ AutoScroll detenido');
  isRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

export function getIsRunning() {
  return isRunning;
}

export function resetScroll() {
  scrollPosition = 0;
  window.scrollTo(0, 0);
}