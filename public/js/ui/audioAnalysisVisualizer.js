import { getChordTones } from '../music/harmony.js';
import { renderFretboard, renderPiano, setActiveScale } from '../rendering/chordDiagram.js';
import { renderBassFretboard } from '../rendering/bassFretboard.js';
import { renderAsciiTab } from '../rendering/tabRenderer.js';
import { SCALES } from '../music/scales.js';

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];
const CHORDS = PITCH_NAMES.flatMap((root) => QUALITIES.map((quality) => `${root}${quality}`));

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function timeLabel(ms) {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}

/** Interactive study surface for one Essentia analysis; nothing here mutates a saved song. */
export function createAudioAnalysisVisualizer({ analysis, onChange = () => {}, onSelect = () => {}, getSection = () => null }) {
  const root = node('section', 'analysis-studio');
  root.setAttribute('aria-labelledby', 'analysis-studio-title');
  const heading = node('h3', '', 'Mapa de análisis de la canción'); heading.id = 'analysis-studio-title';
  const titleRow = node('div', 'analysis-title-row');
  titleRow.append(heading);
  const guide = node('button', 'analysis-help-tip', '?');
  guide.type = 'button'; guide.dataset.tip = 'El mapa muestra energía de notas y picos armónicos. Un pico puede ser un armónico de otra nota; las sugerencias son aproximaciones que puedes corregir.';
  guide.setAttribute('aria-label', guide.dataset.tip);
  titleRow.append(guide); root.append(titleRow);

  const modeLabel = node('label', 'analysis-mode-label', 'Vista global ');
  const mode = node('select', 'analysis-mode');
  [['chroma', 'Mapa de croma / armonía'], ['bass', 'Constelación de bajos'], ['melody', 'Constelación de registro alto']]
    .forEach(([value, label]) => { const option = node('option', '', label); option.value = value; mode.append(option); });
  modeLabel.append(mode);
  const toolbar = node('div', 'analysis-toolbar'); toolbar.append(modeLabel);

  const groupingLabel = node('label', 'analysis-grid-label', 'Agrupar pulsos por compás ');
  const grouping = node('select', 'analysis-grid-grouping');
  for (let count = 2; count <= 12; count++) {
    const option = node('option', '', `${count} pulsos`); option.value = String(count); grouping.append(option);
  }
  grouping.value = '4';
  groupingLabel.append(grouping); toolbar.append(groupingLabel);
  const rhythmGuide = node('button', 'analysis-help-tip', '?');
  rhythmGuide.type = 'button'; rhythmGuide.dataset.tip = 'Las líneas finas marcan pulsos; las gruesas indican compases según el agrupamiento elegido. Cámbialo si no coincide con la métrica de la canción.';
  rhythmGuide.setAttribute('aria-label', rhythmGuide.dataset.tip); toolbar.append(rhythmGuide); root.append(toolbar);

  const waveformCanvas = node('canvas', 'analysis-waveform');
  waveformCanvas.setAttribute('aria-label', 'Forma de onda de toda la pista. Selecciona un punto para escuchar el pasaje.');
  root.append(waveformCanvas);
  const canvas = node('canvas', 'analysis-overview');
  canvas.setAttribute('aria-label', 'Vista completa del análisis. También puedes elegir cada tramo en la lista inferior.');
  root.append(canvas);
  const listHeading = node('h4', 'analysis-segment-heading', 'Tramos del análisis');
  root.append(listHeading);
  const list = node('div', 'analysis-segment-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Tramos del análisis de audio');
  root.append(list);

  const detail = node('section', 'analysis-segment-detail');
  detail.setAttribute('aria-live', 'polite');
  root.append(detail);
  const instrumentPanel = node('section', 'analysis-instruments');
  instrumentPanel.setAttribute('aria-label', 'Instrumento para estudiar el tramo actual');
  root.append(instrumentPanel);

  let selectedIndex = 0;
  let activeChordSelect = null;
  let playbackPositionMs = 0;
  let auditionStatus = '';
  let liveFrame = null;
  let scaleId = 'none';
  let activeInstrument = 'guitar';

  function drawWaveform() {
    const rect = waveformCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = 58;
    waveformCanvas.width = Math.floor(width * ratio); waveformCanvas.height = Math.floor(height * ratio);
    const ctx = waveformCanvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#0b1612'; ctx.fillRect(0, 0, width, height);
    const left = 48; const plotWidth = width - 60; const samples = analysis.waveform || [];
    ctx.strokeStyle = '#273b31'; ctx.beginPath(); ctx.moveTo(left, 29); ctx.lineTo(width - 12, 29); ctx.stroke();
    if (samples.length) {
      ctx.fillStyle = '#69c7ab';
      for (let x = 0; x < plotWidth; x += 2) {
        const index = Math.min(samples.length - 1, Math.floor(x / plotWidth * samples.length));
        const amplitude = Math.max(1, (samples[index] || 0) * 34);
        ctx.fillRect(left + x, 29 - amplitude, 1.5, amplitude * 2);
      }
    } else {
      ctx.fillStyle = '#a3b7a8'; ctx.font = '12px sans-serif';
      ctx.fillText('Forma de onda no disponible; vuelve a analizar el audio para añadirla.', left + 8, 33);
    }
    const segment = analysis.chordCandidates[selectedIndex];
    if (segment) {
      const x = left + segment.startMs / analysis.durationMs * plotWidth;
      const w = Math.max(2, (segment.endMs - segment.startMs) / analysis.durationMs * plotWidth);
      ctx.strokeStyle = '#f2f66f'; ctx.lineWidth = 2; ctx.strokeRect(x, 5, w, 48);
    }
    const cursor = left + Math.max(0, Math.min(analysis.durationMs, playbackPositionMs)) / Math.max(1, analysis.durationMs) * plotWidth;
    ctx.strokeStyle = '#ffad65'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cursor, 4); ctx.lineTo(cursor, 54); ctx.stroke();
    ctx.fillStyle = '#c9d7cd'; ctx.font = '11px sans-serif'; ctx.fillText('Audio', 8, 33);
  }

  function drawOverview() {
    drawWaveform();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !analysis.chordCandidates.length) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = 300;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c100e'; ctx.fillRect(0, 0, width, height);
    const left = 48; const top = 18; const plotWidth = width - left - 12; const plotHeight = height - 42;
    const endMs = Math.max(1, analysis.durationMs);
    const segments = analysis.chordCandidates;

    if (mode.value === 'chroma') {
      const rowHeight = plotHeight / 12;
      PITCH_NAMES.forEach((name, pitch) => {
        ctx.fillStyle = '#c6d0c8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(name, left - 8, top + pitch * rowHeight + rowHeight * 0.7);
      });
      segments.forEach((segment, index) => {
        const x = left + (segment.startMs / endMs) * plotWidth;
        const w = Math.max(1, ((segment.endMs - segment.startMs) / endMs) * plotWidth);
        (segment.chroma || Array(12).fill(0)).forEach((energy, pitch) => {
          const alpha = 0.06 + Math.max(0, Math.min(1, energy)) * 0.9;
          ctx.fillStyle = `rgba(93, 218, 197, ${alpha})`;
          ctx.fillRect(x, top + pitch * rowHeight, w, Math.max(1, rowHeight - 1));
        });
        if (index === selectedIndex) { ctx.strokeStyle = '#f2f66f'; ctx.lineWidth = 2; ctx.strokeRect(x, top, w, plotHeight); }
      });
    } else {
      const isBass = mode.value === 'bass';
      const peaks = segments.flatMap((segment) => isBass ? (segment.bassPeaks || []) : (segment.highPeaks || []));
      const minMidi = isBass ? 24 : 60;
      const maxMidi = isBass ? 60 : 96;
      ctx.strokeStyle = '#34443b'; ctx.lineWidth = 1;
      for (let midi = Math.ceil(minMidi / 12) * 12; midi <= maxMidi; midi += 12) {
        const y = top + plotHeight - ((midi - minMidi) / (maxMidi - minMidi)) * plotHeight;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotWidth, y); ctx.stroke();
        ctx.fillStyle = '#c6d0c8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(`${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`, left - 8, y + 4);
      }
      segments.forEach((segment, index) => {
        const x = left + ((segment.startMs + segment.endMs) / 2 / endMs) * plotWidth;
        const segmentPeaks = isBass ? (segment.bassPeaks || []) : (segment.highPeaks || []);
        segmentPeaks.forEach((peak) => {
          if (peak.midi < minMidi || peak.midi > maxMidi) return;
          const y = top + plotHeight - ((peak.midi - minMidi) / (maxMidi - minMidi)) * plotHeight;
          ctx.beginPath(); ctx.arc(x, y, 2 + 4 * Math.sqrt(peak.strength || 0), 0, Math.PI * 2);
          ctx.fillStyle = index === selectedIndex ? '#f2f66f' : '#81e5da'; ctx.fill();
        });
      });
    }
    const beatTimes = analysis.beats?.length ? analysis.beats.map((seconds) => seconds * 1000)
      : (Number.isFinite(analysis.bpm) && analysis.bpm > 0
        ? Array.from({ length: Math.ceil(endMs / (60_000 / analysis.bpm)) }, (_, index) => index * 60_000 / analysis.bpm)
        : []);
    const beatsPerBar = Number(grouping.value);
    beatTimes.forEach((timeMs, index) => {
      if (timeMs < 0 || timeMs > endMs) return;
      const x = left + (timeMs / endMs) * plotWidth;
      const isBar = index % beatsPerBar === 0;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotHeight);
      ctx.strokeStyle = isBar ? 'rgba(243, 185, 83, 0.72)' : 'rgba(190, 202, 193, 0.25)';
      ctx.lineWidth = isBar ? 2 : 1; ctx.stroke();
      if (isBar) {
        ctx.fillStyle = '#f3b953'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`c${Math.floor(index / beatsPerBar) + 1}`, x + 2, top + 11);
      }
    });
    if (liveFrame) {
      const x = left + (Math.max(0, Math.min(endMs, playbackPositionMs)) / endMs) * plotWidth;
      const livePeaks = mode.value === 'bass' ? liveFrame.bassPeaks : mode.value === 'melody' ? liveFrame.highPeaks : [];
      if (mode.value === 'chroma') {
        const rowHeight = plotHeight / 12;
        liveFrame.chroma?.forEach((energy, pitch) => {
          if (energy < 0.12) return;
          const y = top + pitch * rowHeight + rowHeight / 2;
          ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
          ctx.strokeStyle = '#ff9955'; ctx.lineWidth = Math.min(4, 1 + energy * 3); ctx.stroke();
        });
      } else {
        const minMidi = mode.value === 'bass' ? 24 : 60;
        const maxMidi = mode.value === 'bass' ? 60 : 96;
        livePeaks?.forEach((peak) => {
          if (peak.midi < minMidi || peak.midi > maxMidi) return;
          const y = top + plotHeight - ((peak.midi - minMidi) / (maxMidi - minMidi)) * plotHeight;
          ctx.beginPath(); ctx.arc(x, y, 4 + 3 * (peak.strength || 0), 0, Math.PI * 2);
          ctx.strokeStyle = '#ff9955'; ctx.lineWidth = 2; ctx.stroke();
        });
      }
    }
    const playX = left + (Math.max(0, Math.min(endMs, playbackPositionMs)) / endMs) * plotWidth;
    ctx.beginPath(); ctx.moveTo(playX, top); ctx.lineTo(playX, top + plotHeight);
    ctx.strokeStyle = '#f2f66f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#aebbb1'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('0:00', left, height - 10);
    ctx.textAlign = 'right'; ctx.fillText(timeLabel(endMs), width - 12, height - 10);
  }

  function renderDetail() {
    list.replaceChildren(); detail.replaceChildren();
    const segments = analysis.chordCandidates || [];
    segments.forEach((segment, index) => {
      const chosen = segment.selectedSymbol ? `✓ ${segment.selectedSymbol}` : (segment.symbol ? `¿${segment.symbol}?` : 'Sin acorde');
      const item = node('button', 'analysis-segment', `${index + 1} · ${timeLabel(segment.startMs)}–${timeLabel(segment.endMs)} · ${chosen}`);
      item.type = 'button'; item.setAttribute('aria-current', index === selectedIndex ? 'true' : 'false');
      item.addEventListener('click', () => { selectedIndex = index; renderDetail(); onSelect(segment); });
      list.append(item);
    });
    const segment = segments[selectedIndex];
    drawOverview();
    if (!segment) { detail.append(node('p', '', 'No se obtuvieron tramos para visualizar.')); return; }

    const symbol = segment.selectedSymbol || segment.symbol || '';
    detail.append(node('h4', '', `Tramo ${selectedIndex + 1} · ${timeLabel(segment.startMs)}–${timeLabel(segment.endMs)}`));
    const confidence = Math.max(0, Math.min(1, Number(segment.confidence) || 0));
    const confidenceTier = confidence >= 0.72 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
    const chordCard = node('div', `analysis-chord-card ${segment.selectedSymbol ? 'is-defined' : `is-${confidenceTier}`}`);
    chordCard.append(node('div', 'analysis-chord-card-heading', segment.selectedSymbol
      ? `Acorde definido · ${segment.selectedSymbol}`
      : symbol ? `Acorde aproximado · ${segment.symbol}` : 'Acorde aproximado · sin propuesta clara'));
    const meterLabel = node('div', 'analysis-confidence-label', segment.selectedSymbol
      ? 'Confirmado manualmente' : `Coincidencia orientativa · ${Math.round(confidence * 100)}%`);
    const meter = node('div', 'analysis-confidence-track');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', segment.selectedSymbol ? 'Acorde definido manualmente' : `Ajuste orientativo ${Math.round(confidence * 100)} por ciento`);
    const meterFill = node('span', 'analysis-confidence-fill');
    meterFill.style.width = `${segment.selectedSymbol ? 100 : confidence * 100}%`;
    meter.append(meterFill); chordCard.append(meterLabel, meter); detail.append(chordCard);
    const controls = node('div', 'analysis-chord-controls');
    const listen = node('button', 'analysis-listen-button', '▶ Escuchar tramo seleccionado');
    listen.type = 'button';
    listen.addEventListener('click', () => onSelect(segment));
    const listenStatus = node('p', 'analysis-listen-status', auditionStatus);
    listenStatus.setAttribute('role', 'status');
    listenStatus.setAttribute('aria-live', 'polite');
    controls.append(listen, listenStatus);
    const label = node('label', '', 'Acorde para estudiar / usar en el borrador ');
    const chordSelect = node('select', 'analysis-chord-select');
    chordSelect.add(new Option('— Dejar sin asignar —', ''));
    const alternatives = segment.alternatives || [];
    if (alternatives.length) {
      const group = node('optgroup', '', 'Propuestas para este tramo');
      alternatives.forEach((candidate) => group.append(new Option(`${candidate.symbol} · ${candidate.score.toFixed(3)}`, candidate.symbol)));
      chordSelect.add(group);
    }
    const manualGroup = node('optgroup', '', 'Elegir manualmente');
    CHORDS.forEach((symbol) => manualGroup.append(new Option(symbol, symbol)));
    chordSelect.add(manualGroup);
    chordSelect.value = segment.selectedSymbol || '';
    activeChordSelect = chordSelect;
    chordSelect.addEventListener('change', () => {
      segment.selectedSymbol = chordSelect.value;
      segment.selectionSource = chordSelect.value ? 'manual' : 'unassigned';
      segment.accepted = Boolean(chordSelect.value);
      onChange();
      renderDetail();
    });
    label.append(chordSelect); controls.append(label);
    detail.append(controls);

    const graph = node('div', 'analysis-detail-grid');
    const spectralPanel = node('div', 'analysis-detail-card');
    spectralPanel.append(node('strong', '', 'Picos espectrales dominantes · nota/octava estimada'));
    const peaks = segment.spectralPeaks || [];
    if (!peaks.length) spectralPanel.append(node('p', 'analysis-empty', 'No hay picos suficientes en este tramo.'));
    peaks.slice(0, 6).forEach((peak) => {
      const row = node('div', 'analysis-spectrum-row');
      row.append(node('span', '', `${peak.note} · ${peak.frequencyHz.toFixed(0)} Hz`));
      const track = node('span', 'analysis-chroma-track');
      const fill = node('span', 'analysis-spectrum-fill'); fill.style.width = `${Math.max(2, Math.min(100, (peak.strength || 0) * 100))}%`;
      track.append(fill); row.append(track); spectralPanel.append(row);
    });
    const chromaPanel = node('details', 'analysis-detail-card analysis-chroma-details');
    chromaPanel.append(node('summary', '', 'Energía por nota · HPCP/croma'));
    (segment.chroma || Array(12).fill(0)).forEach((energy, pitch) => {
      const row = node('div', 'analysis-chroma-row');
      row.append(node('span', '', PITCH_NAMES[pitch]));
      const track = node('span', 'analysis-chroma-track');
      const fill = node('span', 'analysis-chroma-fill'); fill.style.width = `${Math.max(0, Math.min(100, energy * 100))}%`;
      track.append(fill); row.append(track, node('span', 'analysis-energy-value', `${Math.round(energy * 100)}%`));
      chromaPanel.append(row);
    });
    graph.append(spectralPanel, chromaPanel); detail.append(graph);

    const section = getSection(segment.startMs);
    instrumentPanel.replaceChildren();
    instrumentPanel.append(node('h4', '', 'Posiciones para tocar'));
    instrumentPanel.append(node('p', 'analysis-instrument-note', symbol
      ? `Acorde actual: ${symbol} · posiciones teóricas`
      : 'Elige un acorde para ver sus posiciones posibles en el instrumento.'));
    const scaleLabel = node('label', 'analysis-scale-control', 'Escala para explorar ');
    const scaleSelect = node('select', 'analysis-scale-select');
    scaleSelect.add(new Option('— Ninguna —', 'none'));
    Object.entries(SCALES).forEach(([id, scale]) => scaleSelect.add(new Option(`${scale.category} · ${scale.name}`, id)));
    scaleSelect.value = scaleId;
    scaleSelect.addEventListener('change', () => { scaleId = scaleSelect.value; renderDetail(); });
    scaleLabel.append(scaleSelect); instrumentPanel.append(scaleLabel);
    const chordNotes = getChordTones(symbol);
    setActiveScale(chordNotes.root || 'C', scaleId);
    const instrumentNav = node('div', 'analysis-instrument-switch');
    const drawing = node('div', 'analysis-instrument-drawing analysis-active-instrument');
    const renderInstrument = () => {
      drawing.replaceChildren();
      if (activeInstrument === 'guitar') renderFretboard(drawing, symbol);
      else if (activeInstrument === 'bass') renderBassFretboard(drawing, symbol);
      else if (activeInstrument === 'piano') renderPiano(drawing, symbol);
      else if (section?.tab?.trim()) renderAsciiTab(drawing, { label: section.label, ascii: section.tab });
      else drawing.append(node('p', 'analysis-empty', 'Esta sección todavía no tiene tablatura. Puedes escribirla en el editor de sección.'));
    };
    [['guitar', 'Guitarra'], ['bass', 'Bajo'], ['piano', 'Piano'], ['tab', 'Tab']].forEach(([id, label]) => {
      const button = node('button', 'analysis-instrument-tab', label); button.type = 'button';
      button.setAttribute('aria-pressed', String(activeInstrument === id));
      button.addEventListener('click', () => { activeInstrument = id; renderDetail(); });
      instrumentNav.append(button);
    });
    instrumentPanel.append(instrumentNav, drawing);
    renderInstrument();
  }

  mode.addEventListener('change', drawOverview);
  grouping.addEventListener('change', drawOverview);
  function selectAtCanvas(event, target) {
    const rect = target.getBoundingClientRect();
    const timeMs = Math.max(0, Math.min(analysis.durationMs - 1, ((event.clientX - rect.left - 48) / (rect.width - 60)) * analysis.durationMs));
    const index = analysis.chordCandidates.findIndex((segment) => timeMs >= segment.startMs && timeMs < segment.endMs);
    if (index >= 0) { selectedIndex = index; renderDetail(); onSelect(analysis.chordCandidates[index]); }
  }
  canvas.addEventListener('click', (event) => selectAtCanvas(event, canvas));
  waveformCanvas.addEventListener('click', (event) => selectAtCanvas(event, waveformCanvas));
  renderDetail();
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(drawOverview) : null;
  resizeObserver?.observe(root);
  requestAnimationFrame(drawOverview);
  function setPlaybackPosition(positionMs, { followSelection = true } = {}) {
    playbackPositionMs = Number.isFinite(positionMs) ? positionMs : 0;
    const index = analysis.chordCandidates.findIndex((segment) => playbackPositionMs >= segment.startMs && playbackPositionMs < segment.endMs);
    if (followSelection && index >= 0 && index !== selectedIndex) { selectedIndex = index; renderDetail(); }
    else drawOverview();
  }

  function setLiveFrame(frame) { liveFrame = frame; drawOverview(); }
  function selectSegmentAt(positionMs) {
    const index = analysis.chordCandidates.findIndex((segment) => positionMs >= segment.startMs && positionMs < segment.endMs);
    if (index >= 0) { selectedIndex = index; renderDetail(); }
  }
  function setAuditionStatus(message) {
    auditionStatus = message;
    const status = detail.querySelector('.analysis-listen-status');
    if (status) status.textContent = message;
  }

  return { element: root, waveformCanvas, redraw: drawOverview, getSelectedSegments: () => analysis.chordCandidates, focusChordSelect: () => activeChordSelect?.focus(),
    setPlaybackPosition, setLiveFrame, setAuditionStatus, selectSegmentAt, refreshDetail: renderDetail,
    dispose: () => resizeObserver?.disconnect(),
    getSelectedSegment: () => analysis.chordCandidates[selectedIndex] || null };
}
