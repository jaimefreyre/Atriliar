import { renderSong } from "../rendering/songRenderer.js";
import { startAutoScroll, stopAutoScroll, setScrollSpeed, resetScroll } from "./autoScroll.js";
import { requestWakeLock, releaseWakeLock } from "./wakeLock.js";
import { updateChordDiagrams, setActiveScale, getChordNotes, setActiveTab } from "../rendering/chordDiagram.js";
import { SCALES, SCALE_CATEGORIES } from "../music/scales.js";
import { buildChordMap, updateCurrentChord, resetChordMap, setOnChordChange, startTracking, stopTracking, getAllChordPositions } from "../rendering/chordTracker.js";

let currentSong = null;
let transposeLevel = 0;
let fontSize = 20;
let trackingRAF = null;
let currentChordStr = "";
let currentTabData = null;
let selectedScale = "none";
let allChordPositions = [];
let currentChordIndex = -1;
let harmonyOpen = false;
let tabOpen = false;

export function enterStageMode(song, container) {
  currentSong = song;
  document.body.classList.add("stage-mode");
  requestWakeLock();
  resetScroll();
  
  document.getElementById("stage-song-title").textContent = song.metadata.title;
  document.getElementById("stage-artist").textContent = song.metadata.artist || "Desconocido";
  document.getElementById("stage-key").textContent = song.metadata.originalKey;
  document.getElementById("stage-bpm").textContent = song.metadata.bpm + " BPM";
  
  const exitBtn = document.getElementById("btn-exit-stage");
  if (exitBtn) exitBtn.onclick = () => exitStageMode();
  
  document.getElementById("btn-toggle-harmony").onclick = () => toggleHarmony();
  document.getElementById("btn-toggle-tab").onclick = () => toggleTab();
  
  populateScaleSelector();
  render();
  setupTouchZones();
  setupChordClickHandlers();
  startChordTracking();
  updateDrawerButtons();
}

export function exitStageMode() {
  stopAutoScroll();
  releaseWakeLock();
  stopChordTracking();
  document.body.classList.remove("stage-mode");
  document.getElementById("app").style.display = "block";
  document.getElementById("stage-container").style.display = "none";
}

export function toggleHarmony() {
  harmonyOpen = !harmonyOpen;
  const drawer = document.getElementById("drawer-harmony");
  if (harmonyOpen) drawer.classList.add("open");
  else drawer.classList.remove("open");
  updateDrawerButtons();
}

export function toggleTab() {
  tabOpen = !tabOpen;
  const drawer = document.getElementById("drawer-tab");
  if (tabOpen) drawer.classList.add("open");
  else drawer.classList.remove("open");
  updateDrawerButtons();
}

function updateDrawerButtons() {
  const btnH = document.getElementById("btn-toggle-harmony");
  const btnT = document.getElementById("btn-toggle-tab");
  if (btnH) btnH.classList.toggle("active", harmonyOpen);
  if (btnT) btnT.classList.toggle("active", tabOpen);
}

function populateScaleSelector() {
  const select = document.getElementById("scale-select");
  select.innerHTML = '<option value="none">— Ninguna —</option>';
  SCALE_CATEGORIES.forEach(cat => {
    const group = document.createElement("optgroup");
    group.label = cat;
    Object.entries(SCALES).forEach(([id, def]) => {
      if (def.category === cat) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = def.name;
        group.appendChild(opt);
      }
    });
    select.appendChild(group);
  });
  select.value = selectedScale;
  select.onchange = (e) => changeScale(e.target.value);
}

export function changeScale(scaleId) {
  selectedScale = scaleId;
  if (currentChordStr) {
    const { root } = getChordNotes(currentChordStr);
    setActiveScale(root, scaleId);
    updateChordDiagrams(currentChordStr, currentTabData);
  }
}

function render() {
  const container = document.getElementById("stage-content");
  renderSong(currentSong, container, { transpose: transposeLevel, fontSize });
  setTimeout(() => {
    allChordPositions = getAllChordPositions();
    buildChordMap();
    setupChordClickHandlers();
    updateProgress();
  }, 100);
}

function updateProgress() {
  if (allChordPositions.length === 0) return;
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const percent = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
  document.getElementById("progress-fill").style.width = percent + "%";
  document.getElementById("progress-percent").textContent = Math.round(percent) + "%";
  
  let currentSection = "";
  let chordInSong = 0;
  for (let i = 0; i < allChordPositions.length; i++) {
    if (allChordPositions[i].top <= scrollTop + window.innerHeight * 0.30) {
      currentChordIndex = i;
      chordInSong = i + 1;
      currentSection = allChordPositions[i].section || "";
    }
  }
  document.getElementById("progress-position").textContent = currentSection + " - Acorde " + chordInSong + "/" + allChordPositions.length;
}

export function adjustTranspose(delta) {
  transposeLevel += delta;
  render();
}

export function adjustFontSize(delta) {
  fontSize = Math.max(12, Math.min(48, fontSize + delta));
  render();
}

export function toggleAutoScroll() {
  const btn = document.getElementById("btn-autoscroll");
  if (btn.classList.contains("active")) {
    stopAutoScroll();
    btn.classList.remove("active");
    btn.textContent = "▶ PLAY";
  } else {
    setScrollSpeed(currentSong.metadata.bpm || 120, 8);
    startAutoScroll();
    btn.classList.add("active");
    btn.textContent = " PAUSE";
  }
}

export function prevChord() {
  if (currentChordIndex > 0) {
    const prevPos = allChordPositions[currentChordIndex - 1];
    window.scrollTo({ top: prevPos.top - window.innerHeight * 0.30, behavior: "smooth" });
  }
}

export function nextChord() {
  if (currentChordIndex < allChordPositions.length - 1) {
    const nextPos = allChordPositions[currentChordIndex + 1];
    window.scrollTo({ top: nextPos.top - window.innerHeight * 0.30, behavior: "smooth" });
  }
}

function setupTouchZones() {
  const leftZone = document.getElementById("touch-left");
  const rightZone = document.getElementById("touch-right");
  if (leftZone) leftZone.onclick = (e) => { e.stopPropagation(); prevChord(); };
  if (rightZone) rightZone.onclick = (e) => { e.stopPropagation(); nextChord(); };
  window.addEventListener("scroll", updateProgress);
}

function setupChordClickHandlers() {
  document.querySelectorAll(".chord-marker").forEach(marker => {
    marker.style.cursor = "pointer";
    marker.onclick = (e) => {
      e.stopPropagation();
      const chord = marker.textContent;
      const lineDiv = marker.closest(".lyric-line");
      const tabData = lineDiv && lineDiv.dataset.tab ? JSON.parse(lineDiv.dataset.tab) : null;
      currentChordStr = chord;
      currentTabData = tabData;
      const { root } = getChordNotes(chord);
      setActiveScale(root, selectedScale);
      setActiveTab(tabData);
      updateChordDiagrams(chord, tabData);
      document.querySelectorAll(".chord-marker").forEach(m => m.classList.remove("clicked-chord"));
      marker.classList.add("clicked-chord");
    };
  });
}

function startChordTracking() {
  startTracking();
  setOnChordChange((chord) => {
    currentChordStr = chord;
    const marker = document.querySelector(".chord-marker.active-chord");
    const lineDiv = marker && marker.closest(".lyric-line");
    const tabData = lineDiv && lineDiv.dataset.tab ? JSON.parse(lineDiv.dataset.tab) : null;
    currentTabData = tabData;
    const { root } = getChordNotes(chord);
    setActiveScale(root, selectedScale);
    setActiveTab(tabData);
    updateChordDiagrams(chord, tabData);
    updateProgress();
  });
  function trackLoop() {
    if (!trackingRAF) return;
    updateCurrentChord();
    trackingRAF = requestAnimationFrame(trackLoop);
  }
  trackingRAF = requestAnimationFrame(trackLoop);
}

function stopChordTracking() {
  stopTracking();
  if (trackingRAF) { cancelAnimationFrame(trackingRAF); trackingRAF = null; }
  resetChordMap();
}