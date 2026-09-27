import { getChordTones } from '../music/harmony.js';

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
export function createAudioAnalysisVisualizer({ analysis, onChange = () => {}, onSelect = () => {} }) {
  const root = node('section', 'analysis-studio');
  root.setAttribute('aria-labelledby', 'analysis-studio-title');
  root.append(node('h3', '', 'Mapa de análisis de la canción'));
  root.append(node('p', 'analysis-explainer', 'La altura de los armónicos puede crear varias lecturas posibles. El color muestra energía relativa de croma; los puntos muestran picos del espectro agrupados por nota. Un pico puede ser un armónico y no la fundamental. Las propuestas no son probabilidades ni acordes confirmados.'));

  const modeLabel = node('label', 'analysis-mode-label', 'Vista global ');
  const mode = node('select', 'analysis-mode');
  [['chroma', 'Mapa de croma / armonía'], ['bass', 'Constelación de bajos'], ['melody', 'Constelación de registro alto']]
    .forEach(([value, label]) => { const option = node('option', '', label); option.value = value; mode.append(option); });
  modeLabel.append(mode);
  root.append(modeLabel);

  const groupingLabel = node('label', 'analysis-grid-label', 'Agrupar pulsos por compás ');
  const grouping = node('select', 'analysis-grid-grouping');
  for (let count = 2; count <= 12; count++) {
    const option = node('option', '', `${count} pulsos`); option.value = String(count); grouping.append(option);
  }
  grouping.value = '4';
  groupingLabel.append(grouping); root.append(groupingLabel);
  root.append(node('p', 'analysis-grid-note', 'Las líneas finas son pulsos detectados; las gruesas marcan el inicio de cada compás según la agrupación elegida. Ajusta esa agrupación si el pulso estimado no coincide con el compás musical.'));

  const canvas = node('canvas', 'analysis-overview');
  canvas.setAttribute('aria-label', 'Vista completa del análisis. También puedes elegir cada tramo en la lista inferior.');
  root.append(canvas);
  const listHeading = node('h4', '', 'Tramos de toda la canción · selecciona uno para estudiarlo');
  root.append(listHeading);
  const list = node('div', 'analysis-segment-list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Tramos del análisis de audio');
  root.append(list);

  const detail = node('section', 'analysis-segment-detail');
  detail.setAttribute('aria-live', 'polite');
  root.append(detail);

  let selectedIndex = 0;
  let activeChordSelect = null;
  let playbackPositionMs = 0;
  let auditionStatus = 'Haz clic en un tramo del mapa o de la lista para escucharlo.';
  let liveFrame = null;

  function drawOverview() {
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
      item.type = 'button'; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === selectedIndex));
      item.addEventListener('click', () => { selectedIndex = index; renderDetail(); onSelect(segment); });
      list.append(item);
    });
    const segment = segments[selectedIndex];
    drawOverview();
    if (!segment) { detail.append(node('p', '', 'No se obtuvieron tramos para visualizar.')); return; }

    const time = `${timeLabel(segment.startMs)}–${timeLabel(segment.endMs)} (${((segment.endMs - segment.startMs) / 1000).toFixed(2)} s)`;
    detail.append(node('h4', '', `Tramo ${selectedIndex + 1} · ${time}`));
    const suggestion = segment.symbol
      ? `Sugerencia automática: ${segment.symbol} · ajuste ${segment.confidence.toFixed(3)} · margen ${segment.margin.toFixed(3)} (métricas internas, no porcentajes).`
      : 'Sin propuesta automática clara para este tramo.';
    detail.append(node('p', 'analysis-suggestion', suggestion));
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
    const chromaPanel = node('div', 'analysis-detail-card');
    chromaPanel.append(node('strong', '', 'Energía por nota (HPCP/croma)'));
    (segment.chroma || Array(12).fill(0)).forEach((energy, pitch) => {
      const row = node('div', 'analysis-chroma-row');
      row.append(node('span', '', PITCH_NAMES[pitch]));
      const track = node('span', 'analysis-chroma-track');
      const fill = node('span', 'analysis-chroma-fill'); fill.style.width = `${Math.max(0, Math.min(100, energy * 100))}%`;
      track.append(fill); row.append(track);
      row.append(node('span', 'analysis-energy-value', `${Math.round(energy * 100)}%`));
      chromaPanel.append(row);
    });
    const spectralPanel = node('div', 'analysis-detail-card');
    spectralPanel.append(node('strong', '', 'Picos espectrales dominantes · nota/octava estimada'));
    const peaks = segment.spectralPeaks || [];
    if (!peaks.length) spectralPanel.append(node('p', 'analysis-empty', 'No hay picos suficientes en este tramo.'));
    peaks.slice(0, 12).forEach((peak) => {
      const row = node('div', 'analysis-spectrum-row');
      row.append(node('span', '', `${peak.note} · ${peak.frequencyHz.toFixed(0)} Hz`));
      const track = node('span', 'analysis-chroma-track');
      const fill = node('span', 'analysis-spectrum-fill'); fill.style.width = `${Math.max(2, Math.min(100, (peak.strength || 0) * 100))}%`;
      track.append(fill); row.append(track); spectralPanel.append(row);
    });
    graph.append(chromaPanel, spectralPanel); detail.append(graph);
  }

  mode.addEventListener('change', drawOverview);
  grouping.addEventListener('change', drawOverview);
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const timeMs = Math.max(0, Math.min(analysis.durationMs, ((event.clientX - rect.left - 48) / (rect.width - 60)) * analysis.durationMs));
    const index = analysis.chordCandidates.findIndex((segment) => timeMs >= segment.startMs && timeMs < segment.endMs);
    if (index >= 0) { selectedIndex = index; renderDetail(); onSelect(analysis.chordCandidates[index]); }
  });
  renderDetail();
  function setPlaybackPosition(positionMs) {
    playbackPositionMs = Number.isFinite(positionMs) ? positionMs : 0;
    const index = analysis.chordCandidates.findIndex((segment) => playbackPositionMs >= segment.startMs && playbackPositionMs < segment.endMs);
    if (index >= 0 && index !== selectedIndex) { selectedIndex = index; renderDetail(); }
    else drawOverview();
  }

  function setLiveFrame(frame) { liveFrame = frame; drawOverview(); }
  function setAuditionStatus(message) {
    auditionStatus = message;
    const status = detail.querySelector('.analysis-listen-status');
    if (status) status.textContent = message;
  }

  return { element: root, getSelectedSegments: () => analysis.chordCandidates, focusChordSelect: () => activeChordSelect?.focus(),
    setPlaybackPosition, setLiveFrame, setAuditionStatus };
}
