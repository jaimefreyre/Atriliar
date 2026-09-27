import { getChordTones } from '../music/harmony.js';
import { pitchClassToSharpName } from '../music/notes.js';

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SVG_NS = 'http://www.w3.org/2000/svg';

function makeNode(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSvg(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

function polar(cx, cy, radius, angle) {
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function ringSector(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, outerRadius, startAngle);
  const [x2, y2] = polar(cx, cy, outerRadius, endAngle);
  const [x3, y3] = polar(cx, cy, innerRadius, endAngle);
  const [x4, y4] = polar(cx, cy, innerRadius, startAngle);
  return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`;
}

function peakName(peak) {
  return peak.note || `${pitchClassToSharpName(peak.midi % 12)}${Math.floor(peak.midi / 12) - 1}`;
}

function getCurrentFrame(analysis, positionMs, segment) {
  const frames = analysis.spectralFrames;
  if (frames?.length) {
    let low = 0, high = frames.length - 1, best = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (frames[middle].timeMs <= positionMs) { best = middle; low = middle + 1; } else high = middle - 1;
    }
    const frame = frames[best];
    if (segment && (frame.timeMs < segment.startMs || frame.timeMs >= segment.endMs)) {
      return { timeMs: positionMs, peaks: segment.spectralPeaks || [] };
    }
    return frame;
  }
  return segment ? { timeMs: positionMs, peaks: segment.spectralPeaks || [] } : null;
}

function getChordPitches(segment, frame) {
  const symbol = segment?.selectedSymbol || segment?.symbol || '';
  const chord = getChordTones(symbol);
  if (!chord.recognized) return [];
  const peakList = frame?.peaks?.length ? frame.peaks : segment?.spectralPeaks || [];
  return chord.tones.slice(0, 3).map((pitchClass) => {
    const fromFrame = peakList
      .filter((peak) => Number.isFinite(peak.midi) && ((peak.midi % 12) + 12) % 12 === pitchClass)
      .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
    if (fromFrame) return fromFrame;
    return (segment?.spectralPeaks || [])
      .filter((peak) => Number.isFinite(peak.midi) && ((peak.midi % 12) + 12) % 12 === pitchClass)
      .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0] || null;
  })
    .filter(Boolean)
    .sort((a, b) => a.midi - b.midi);
}

/** Circle-of-fifths plus a time-aligned spectral map for the selected analysis. */
export function createHarmonicCircle({ analysis, segment, playbackPositionMs = 0 }) {
  const root = makeNode('section', 'harmonic-dashboard');
  root.setAttribute('aria-label', 'Círculo de quintas y picos del tramo actual');
  const circleColumn = makeNode('div', 'harmonic-circle-column');
  const circleTitle = makeNode('h5', '', 'Círculo de quintas');
  const svg = makeSvg('svg', { class: 'harmonic-fifths-svg', viewBox: '0 0 280 280', role: 'img', 'aria-labelledby': 'harmonic-wheel-title harmonic-wheel-desc' });
  const svgTitle = makeSvg('title', { id: 'harmonic-wheel-title' }); svgTitle.textContent = 'Círculo de quintas y notas del acorde';
  const svgDesc = makeSvg('desc', { id: 'harmonic-wheel-desc' }); svgDesc.textContent = 'La rueda resalta las notas con energía en el tramo actual. Los puntos naranjas muestran graves y los turquesa notas agudas.';
  svg.append(svgTitle, svgDesc);
  const ringGroup = makeSvg('g');
  const pointsGroup = makeSvg('g');
  svg.append(ringGroup, pointsGroup);
  const chordHub = makeNode('div', 'harmonic-chord-hub');
  const chordName = makeNode('strong', 'harmonic-chord-name', '—');
  const chordQuality = makeNode('span', 'harmonic-chord-quality', 'sin acorde claro');
  const chordNotes = makeNode('div', 'harmonic-chord-notes');
  chordHub.append(chordName, chordQuality, chordNotes);
  const wheel = makeNode('div', 'harmonic-wheel-wrap'); wheel.append(svg, chordHub);
  const wheelLegend = makeNode('div', 'harmonic-wheel-legend');
  wheelLegend.append(
    makeNode('span', '', '● Graves'),
    makeNode('span', '', '● Agudos'),
    makeNode('span', '', 'Anillo: energía de nota'),
  );
  circleColumn.append(circleTitle, wheel, wheelLegend);

  const spectrumColumn = makeNode('div', 'harmonic-spectrum-column');
  const spectrumHeading = makeNode('div', 'harmonic-spectrum-heading');
  const spectrumTitle = makeNode('h5', '', 'Picos del tramo actual');
  const spectrumTime = makeNode('span', 'harmonic-spectrum-time', '0:00');
  spectrumHeading.append(spectrumTitle, spectrumTime);
  const peakReadout = makeNode('div', 'harmonic-peak-readout');
  const constellation = makeNode('div', 'harmonic-constellation-readout');
  spectrumColumn.append(spectrumHeading, peakReadout, constellation);
  root.append(circleColumn, spectrumColumn);

  const historyElement = makeNode('section', 'harmonic-history-dock');
  historyElement.setAttribute('aria-label', 'Recorrido armónico a lo largo de la canción');
  const historyHeading = makeNode('div', 'harmonic-history-heading');
  historyHeading.append(makeNode('h4', '', 'Recorrido armónico · alturas probables del acorde'));
  const historyLegend = makeNode('div', 'harmonic-history-legend');
  historyHeading.append(historyLegend);
  const historyCanvas = makeNode('canvas', 'harmonic-history-canvas');
  historyCanvas.setAttribute('role', 'img');
  historyCanvas.setAttribute('aria-label', 'Tres líneas muestran las alturas probables de las notas del acorde a lo largo de la canción. El eje vertical empieza en la nota más grave detectada.');
  historyElement.append(historyHeading, historyCanvas);

  let resizeObserver = null;
  let currentSegment = segment;
  let currentPositionMs = playbackPositionMs;
  let liveFrame = null;
  let lastHistoryDraw = 0;

  function updateCircle(nextSegment, frame) {
    ringGroup.replaceChildren(); pointsGroup.replaceChildren(); chordNotes.replaceChildren();
    const symbol = nextSegment?.selectedSymbol || nextSegment?.symbol || '';
    const chord = getChordTones(symbol);
    const chordPitchClasses = new Set(chord.tones);
    const rootPitchClass = chord.rootPitchClass;
    const chroma = nextSegment?.chroma || [];
    const center = 140, inner = 98, outer = 118, labelRadius = 132;
    for (let index = 0; index < 12; index++) {
      const pc = FIFTHS[index];
      const angle = -Math.PI / 2 + index * Math.PI / 6;
      const start = angle - Math.PI / 12 + .012;
      const end = angle + Math.PI / 12 - .012;
      const energy = clamp(chroma[pc], 0, 1);
      const isTone = chordPitchClasses.has(pc);
      const sector = makeSvg('path', {
        d: ringSector(center, center, inner, outer, start, end),
        class: `harmonic-note-sector${isTone ? ' is-chord-tone' : ''}${pc === rootPitchClass ? ' is-root' : ''}`,
        fill: isTone ? `rgba(224,239,107,${.3 + energy * .65})` : `rgba(75,204,185,${.1 + energy * .78})`,
      });
      sector.append(makeSvg('title'));
      sector.firstChild.textContent = `${NOTES[pc]} · energía ${Math.round(energy * 100)}%${isTone ? ' · nota del acorde' : ''}`;
      ringGroup.append(sector);
      const [x, y] = polar(center, center, labelRadius, angle);
      const label = makeSvg('text', { x, y: y + 4, class: `harmonic-wheel-note${isTone ? ' is-chord-tone' : ''}${pc === rootPitchClass ? ' is-root' : ''}`, 'text-anchor': 'middle' });
      label.textContent = NOTES[pc]; ringGroup.append(label);
    }

    const peaks = (frame?.peaks || nextSegment?.spectralPeaks || []).slice(0, 24);
    const pointsByRegister = { bass: [], high: [] };
    for (const peak of peaks) {
      if (!Number.isFinite(peak.midi)) continue;
      const pc = ((peak.midi % 12) + 12) % 12;
      const wheelIndex = FIFTHS.indexOf(pc);
      const angle = -Math.PI / 2 + wheelIndex * Math.PI / 6;
      const octave = Math.floor(peak.midi / 12) - 1;
      const radius = clamp(54 + (octave - 2) * 10, 48, 94);
      const [x, y] = polar(center, center, radius, angle);
      const strength = clamp(peak.strength, .08, 1);
      const register = peak.midi < 60 ? 'bass' : 'high';
      pointsByRegister[register].push(peak);
      const point = makeSvg('circle', {
        cx: x, cy: y, r: 2.4 + strength * 3.6,
        class: `harmonic-spectrum-point ${register}`,
        tabindex: '0',
        'aria-label': `${peakName(peak)} · ${Math.round(peak.frequencyHz || 0)} Hz · intensidad ${Math.round(strength * 100)}%`,
      });
      const title = makeSvg('title');
      title.textContent = `${peakName(peak)} · ${Math.round(peak.frequencyHz || 0)} Hz · ${Math.round(strength * 100)}% · ${register === 'bass' ? 'graves' : 'agudos'}`;
      point.append(title); pointsGroup.append(point);
    }
    chordName.textContent = symbol || '—';
    chordQuality.textContent = nextSegment?.selectedSymbol ? 'acorde definido' : symbol ? 'acorde aproximado' : 'sin acorde claro';
    if (chord.recognized) chord.tones.forEach((pc) => chordNotes.append(makeNode('span', `harmonic-note-chip${pc === rootPitchClass ? ' is-root' : ''}`, pitchClassToSharpName(pc))));
    else if (nextSegment?.chroma?.length) {
      [...nextSegment.chroma].map((energy, pitch) => ({ pitch, energy }))
        .sort((a, b) => b.energy - a.energy).slice(0, 3)
        .forEach(({ pitch }) => chordNotes.append(makeNode('span', 'harmonic-note-chip is-estimate', NOTES[pitch])));
      chordQuality.textContent = 'notas dominantes · acorde incierto';
    } else chordNotes.append(makeNode('span', 'harmonic-note-chip is-empty', 'notas no disponibles'));
    return pointsByRegister;
  }

  function drawHarmonicHistory(now = performance.now()) {
    if (now - lastHistoryDraw < 100) return;
    lastHistoryDraw = now;
    const rect = historyCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(220, Math.floor(rect.width));
    const height = 124;
    historyCanvas.width = Math.floor(width * ratio); historyCanvas.height = Math.floor(height * ratio);
    const ctx = historyCanvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#08110d'; ctx.fillRect(0, 0, width, height);
    const left = 58, right = width - 12, top = 8, bottom = height - 23;
    const plotWidth = right - left, plotHeight = bottom - top;
    const duration = Math.max(1, analysis.durationMs || 1);
    const frames = analysis.spectralFrames || [];
    const parts = analysis.chordCandidates || [];
    const allAudioMidi = frames.flatMap((frame) => (frame.peaks || []).map((peak) => peak.midi))
      .filter((midi) => Number.isFinite(midi));
    const notesByFrame = [];
    let partIndex = 0;
    const historyFrames = frames.length ? frames : parts.map((part) => ({
      timeMs: (part.startMs + part.endMs) / 2, peaks: part.spectralPeaks || [],
    }));
    for (const frame of historyFrames) {
      while (partIndex + 1 < parts.length && frame.timeMs >= parts[partIndex].endMs) partIndex++;
      const part = parts[partIndex];
      const notes = getChordPitches(part, frame);
      notesByFrame.push({ timeMs: frame.timeMs, notes });
    }
    const usedPitches = [...new Set(notesByFrame.flatMap((frame) => frame.notes.map((note) => note.midi)))];
    const minMidi = allAudioMidi.length ? Math.min(...allAudioMidi) : (usedPitches.length ? Math.min(...usedPitches) : 36);
    const maxMidi = allAudioMidi.length ? Math.max(...allAudioMidi) : (usedPitches.length ? Math.max(...usedPitches) : minMidi + 12);
    const pitchRange = Math.max(12, maxMidi - minMidi);
    const yFor = (midi) => bottom - (midi - minMidi) / pitchRange * plotHeight;
    ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'right';
    for (const midi of usedPitches) {
      const y = yFor(midi);
      ctx.strokeStyle = 'rgba(197,221,195,.13)'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(197,221,195,.42)'; ctx.beginPath(); ctx.moveTo(left - 5, y); ctx.lineTo(left, y); ctx.stroke();
    }
    let lastLabelY = -Infinity;
    for (const midi of usedPitches.sort((a, b) => b - a)) {
      const y = yFor(midi);
      if (y - lastLabelY < 10) continue;
      ctx.fillStyle = '#c4d2c4';
      ctx.fillText(`${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`, left - 7, y + 3);
      lastLabelY = y;
    }
    const voiceColors = ['#f2a45d', '#56d9c4', '#e583bd'];
    for (let voice = 0; voice < 3; voice++) {
      ctx.beginPath(); let drawing = false;
      notesByFrame.forEach(({ timeMs, notes }) => {
        const note = notes[voice];
        if (!note) { drawing = false; return; }
        const x = left + clamp(timeMs / duration, 0, 1) * plotWidth;
        const y = yFor(note.midi);
        if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = voiceColors[voice]; ctx.lineWidth = 2; ctx.globalAlpha = .9; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const active = currentSegment;
    if (active) {
      const x1 = left + active.startMs / duration * plotWidth;
      const x2 = left + active.endMs / duration * plotWidth;
      ctx.fillStyle = 'rgba(235,243,116,.08)'; ctx.fillRect(x1, top, Math.max(2, x2 - x1), plotHeight);
      ctx.strokeStyle = 'rgba(239,242,116,.55)'; ctx.lineWidth = 1; ctx.strokeRect(x1, top, Math.max(2, x2 - x1), plotHeight);
    }
    const cursorX = left + clamp(currentPositionMs / duration, 0, 1) * plotWidth;
    ctx.strokeStyle = '#ff986b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cursorX, top); ctx.lineTo(cursorX, bottom); ctx.stroke();
    ctx.fillStyle = '#a7b9ab'; ctx.textAlign = 'left'; ctx.fillText(`0 · ${peakName({ midi: minMidi })}`, left, height - 6);
    const endSeconds = duration / 1000;
    ctx.textAlign = 'right'; ctx.fillText(`${Math.floor(endSeconds / 60)}:${String(Math.floor(endSeconds % 60)).padStart(2, '0')}`, right, height - 6);
    const currentPitches = getChordPitches(currentSegment, getCurrentFrame(analysis, currentPositionMs, currentSegment));
    historyLegend.replaceChildren();
    currentPitches.slice(0, 3).forEach((pitch, index) => historyLegend.append(makeNode('span', `harmonic-voice-chip voice-${index}`, peakName(pitch))));
    if (!currentPitches.length) historyLegend.append(makeNode('span', 'harmonic-history-empty', 'Sin acorde definido para este tramo'));
  }

  function update(nextSegment = currentSegment, positionMs = currentPositionMs, nextLiveFrame = liveFrame) {
    currentSegment = nextSegment;
    currentPositionMs = Math.max(0, Number(positionMs) || 0);
    liveFrame = nextLiveFrame;
    const frame = liveFrame?.spectralPeaks?.length
      ? { timeMs: currentPositionMs, peaks: liveFrame.spectralPeaks }
      : getCurrentFrame(analysis, currentPositionMs, currentSegment);
    const groups = updateCircle(currentSegment, frame);
    spectrumTime.textContent = `${Math.floor(currentPositionMs / 60000)}:${String(Math.floor(currentPositionMs / 1000) % 60).padStart(2, '0')}`;
    peakReadout.replaceChildren();
    const peaks = (frame?.peaks || []).slice(0, 4);
    peaks.forEach((peak) => {
      const item = makeNode('span', `harmonic-peak-chip ${peak.midi < 60 ? 'bass' : 'high'}`,
        `${peakName(peak)} · ${Math.round(peak.frequencyHz || 0)} Hz · ${Math.round(clamp(peak.strength, 0, 1) * 100)}%`);
      peakReadout.append(item);
    });
    constellation.replaceChildren();
    for (const [key, label] of [['bass', 'Graves'], ['high', 'Agudos']]) {
      const strongest = groups[key].slice(0, 3).map(peakName);
      const item = makeNode('span', `harmonic-register-chip ${key}`, `${label}: ${strongest.join(' · ') || 'sin picos'}`);
      constellation.append(item);
    }
    drawHarmonicHistory();
  }

  update(segment, playbackPositionMs, null);
  resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { lastHistoryDraw = 0; drawHarmonicHistory(); }) : null;
  resizeObserver?.observe(root); resizeObserver?.observe(historyElement);
  requestAnimationFrame(() => { lastHistoryDraw = 0; drawHarmonicHistory(); });
  return { element: root, historyElement, historyCanvas, update, dispose: () => resizeObserver?.disconnect() };
}
