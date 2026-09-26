let chordPositions = [];
let currentChord = null;
let currentIndex = -1;
let onChordChangeCallback = null;

export function getAllChordPositions() {
  return chordPositions;
}

export function buildChordMap() {
  chordPositions = [];
  const markers = document.querySelectorAll('.chord-marker');
  
  markers.forEach(marker => {
    const rect = marker.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const left = rect.left + window.scrollX;
    const effectiveTop = top + (left * 0.01);
    
    const lineDiv = marker.closest('.lyric-line');
    let sectionName = "";
    if (lineDiv) {
      let prev = lineDiv.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('section-header')) {
          sectionName = prev.textContent.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }
    }
    
    chordPositions.push({
      chord: marker.textContent,
      top: top,
      left: left,
      effectiveTop: effectiveTop,
      element: marker,
      lineDiv: lineDiv,
      section: sectionName
    });
  });
  
  chordPositions.sort((a, b) => a.effectiveTop - b.effectiveTop);
  currentIndex = -1;
  currentChord = null;
  
  if (chordPositions.length > 0) {
    currentIndex = 0;
    currentChord = chordPositions[0].chord;
    if (onChordChangeCallback) onChordChangeCallback(currentChord);
    chordPositions[0].element.classList.add('active-chord');
  }
}

export function updateCurrentChord() {
  if (chordPositions.length === 0) return null;
  
  const referenceTop = window.scrollY + (window.innerHeight * 0.30);
  const referenceEffective = referenceTop + (window.scrollX * 0.01);
  
  let bestIndex = 0;
  for (let i = 0; i < chordPositions.length; i++) {
    if (chordPositions[i].effectiveTop <= referenceEffective + 30) {
      bestIndex = i;
    } else {
      break;
    }
  }
  
  if (bestIndex !== currentIndex) {
    currentIndex = bestIndex;
    currentChord = chordPositions[bestIndex].chord;
    
    document.querySelectorAll('.chord-marker').forEach(m => m.classList.remove('active-chord'));
    chordPositions[bestIndex].element.classList.add('active-chord');
    
    if (onChordChangeCallback) {
      onChordChangeCallback(currentChord);
    }
    
    return currentChord;
  }
  return null;
}

export function getCurrentChord() { return currentChord; }
export function resetChordMap() { chordPositions = []; currentChord = null; currentIndex = -1; }
export function setOnChordChange(callback) { onChordChangeCallback = callback; }
export function startTracking() {}
export function stopTracking() {}