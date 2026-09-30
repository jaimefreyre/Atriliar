import { getChordTones } from '../music/harmony.js';
import { renderFretboard, renderPiano, setActiveScale } from '../rendering/chordDiagram.js';
import { renderBassFretboard } from '../rendering/bassFretboard.js';
import { renderAsciiTab } from '../rendering/tabRenderer.js';
import { SCALES } from '../music/scales.js';
import { createHarmonicCircle } from './harmonicCircle.js';
import { extractMidiVoices, midiRegisterFor, selectMidiPlaybackEvents } from '../audio/midiVoices.js';
import { editAnalysisHarmony, setAnalysisSensitivity } from '../harmony/analysisHarmony.js';

const ALTERNATIVE_REASONS = { 'otra-raiz': 'otra raíz', color: 'color', 'mismas-notas': 'mismas notas', bajo: 'otro bajo' };

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

function spectralFrameAt(analysis, positionMs) {
  const frames = analysis.spectralFrames || [];
  if (!frames.length) return null;
  let low = 0, high = frames.length - 1, best = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle].timeMs <= positionMs) { best = middle; low = middle + 1; } else high = middle - 1;
  }
  return frames[best];
}

function spectralPeaksAt(analysis, segment, positionMs) {
  const frame = spectralFrameAt(analysis, positionMs);
  return frame && (!segment || frame.timeMs >= segment.startMs && frame.timeMs < segment.endMs)
    ? frame.peaks || [] : segment?.spectralPeaks || [];
}

/** Interactive study surface for one Essentia analysis; nothing here mutates a saved song. */
export function createAudioAnalysisVisualizer({ analysis, onChange = () => {}, onSelect = () => {}, onSeek = () => {}, onMidiTransport = () => {}, getSection = () => null }) {
  const root = node('section', 'analysis-studio');
  root.setAttribute('aria-labelledby', 'analysis-studio-title');
  const heading = node('h3', '', 'Mapa de análisis de la canción'); heading.id = 'analysis-studio-title';
  const titleRow = node('div', 'analysis-title-row');
  const circleWidgetHost = node('div', 'analysis-circle-widget-host');
  titleRow.append(heading, circleWidgetHost); root.append(titleRow);

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
  // One chord answer (the harmony track); the knob trades "cambia muchísimo"
  // against "no detecta cambios" and never overwrites what the musician decided.
  const sensitivityLabel = node('label', 'analysis-resolution-label', 'Sensibilidad de cambios ');
  const sensitivity = node('select', 'analysis-sensitivity');
  [['estable', 'Estable · pocos cambios'], ['normal', 'Normal'], ['detallada', 'Detallada · cambios cortos']].forEach(([value, label]) => {
    const option = node('option', '', label); option.value = value; sensitivity.append(option);
  });
  sensitivity.value = analysis.harmony?.sensitivity || 'normal';
  sensitivity.disabled = !analysis.harmony;
  sensitivityLabel.append(sensitivity); toolbar.append(sensitivityLabel);
  const beatViewLabel = node('label', 'analysis-resolution-label');
  const beatView = node('input', 'analysis-beat-view');
  beatView.type = 'checkbox';
  beatViewLabel.append(beatView, ' Evidencia por golpe (solo lectura)');
  toolbar.append(beatViewLabel);
  root.append(toolbar);

  const panelControls = node('nav', 'analysis-panel-controls');
  panelControls.setAttribute('aria-label', 'Herramientas visibles del análisis');
  const panelDefinitions = [
    ['segments', 'Tramos'], ['detail', 'Evidencia'], ['instruments', 'Instrumentos'], ['voices', 'Líneas MIDI'], ['circle', 'Círculo de quintas'], ['sections', 'Estructura'],
  ];
  const panelButtons = new Map();
  const panelPrefsKey = 'stageprompter:analysis-panels:v1';
  const defaultPanelState = { segments: true, detail: true, instruments: true, voices: true, circle: true, sections: true };
  let savedPanelState = {};
  try { savedPanelState = JSON.parse(localStorage.getItem(panelPrefsKey) || '{}') || {}; } catch { savedPanelState = {}; }
  const panelState = { ...defaultPanelState, ...savedPanelState };
  panelDefinitions.forEach(([id, label]) => {
    const button = node('button', 'analysis-panel-toggle', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(panelState[id]));
    button.addEventListener('click', () => {
      panelState[id] = !panelState[id];
      button.setAttribute('aria-pressed', String(panelState[id]));
      applyPanelState();
      try { localStorage.setItem(panelPrefsKey, JSON.stringify(panelState)); } catch { /* storage may be disabled */ }
    });
    panelButtons.set(id, button); panelControls.append(button);
  });
  root.append(panelControls);

  const waveformCanvas = node('canvas', 'analysis-waveform');
  waveformCanvas.setAttribute('aria-label', 'Forma de onda de toda la pista. Selecciona un punto para escuchar el pasaje.');
  root.append(waveformCanvas);
  const canvas = node('canvas', 'analysis-overview');
  canvas.setAttribute('aria-label', 'Vista completa del análisis. También puedes elegir cada tramo en la lista inferior.');
  root.append(canvas);
  const segmentsPanel = node('section', 'analysis-segments-panel');
  segmentsPanel.dataset.analysisPanel = 'segments';
  const listHeading = node('h4', 'analysis-segment-heading', 'Tramos armónicos');
  segmentsPanel.append(listHeading);
  const list = node('div', 'analysis-segment-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Tramos del análisis de audio');
  segmentsPanel.append(list); root.append(segmentsPanel);

  const detail = node('section', 'analysis-segment-detail');
  detail.dataset.analysisPanel = 'detail';
  detail.setAttribute('aria-live', 'polite');
  root.append(detail);
  const instrumentPanel = node('section', 'analysis-instruments');
  instrumentPanel.dataset.analysisPanel = 'instruments';
  instrumentPanel.setAttribute('aria-label', 'Instrumento para estudiar el tramo actual');
  root.append(instrumentPanel);
  const midiVoicePanel = node('section', 'analysis-midi-voices');
  midiVoicePanel.dataset.analysisPanel = 'voices';
  midiVoicePanel.setAttribute('aria-label', 'Líneas de bajo, registro medio y agudo con edición y sonido MIDI emulado');
  root.append(midiVoicePanel);
  const harmonicHistoryHost = node('div', 'harmonic-history-host');

  let selectedIndex = 0;
  let activeChordSelect = null;
  let harmonicVisualization = null;
  let playbackPositionMs = 0;
  let auditionStatus = '';
  let liveFrame = null;
  let scaleId = 'none';
  let activeInstrument = 'guitar';
  let refreshSpectralOverlay = () => {};
  let lastSpectralPitchSignature = '';
  let midiInstrument = 'guitar';
  let midiAudioContext = null;
  let midiMasterGain = null;
  let midiCompressor = null;
  let midiSources = [];
  let midiAnimation = null;
  let midiTickTimer = null;
  let midiPlaybackClock = null;
  let midiVoiceState = null;
  let midiMode = 'all';
  let midiRegister = 'middle';
  let midiScope = 'song';
  let midiBackingAudible = false;
  let midiPaused = false;
  let midiActiveSegmentIndex = -1;
  let midiPlaybackRate = 1;
  const midiEq = { low: 0, mid: 0, high: 0 };
  let midiEqFilters = null;
  const visibleHarmonicVoices = [true, true, true];

  function getSegments() {
    if (beatView.checked) return analysis.chordCandidates || [];
    return analysis.harmonicRegions?.length ? analysis.harmonicRegions : analysis.chordCandidates || [];
  }
  const indexAt = (timeMs) => Math.max(0, getSegments().findIndex((item) => item.startMs <= timeMs && item.endMs > timeMs));

  function applyPanelState() {
    segmentsPanel.hidden = !panelState.segments;
    detail.hidden = !panelState.detail;
    instrumentPanel.hidden = !panelState.instruments;
    midiVoicePanel.hidden = !panelState.voices;
    circleWidgetHost.hidden = !panelState.circle;
    const sectionsPanel = root.querySelector('[data-analysis-panel="sections"]');
    if (sectionsPanel) sectionsPanel.hidden = !panelState.sections;
    root.dataset.visiblePanels = panelDefinitions.filter(([id]) => panelState[id]).map(([id]) => id).join(' ');
  }

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
    const segment = getSegments()[selectedIndex];
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
    if (!rect.width || !getSegments().length) return;
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
    const segments = getSegments();

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

  function stopMidiPlayback() {
    if (midiAnimation !== null) cancelAnimationFrame(midiAnimation);
    if (midiTickTimer !== null) clearInterval(midiTickTimer);
    midiTickTimer = null;
    midiAnimation = null; midiPlaybackClock = null;
    midiSources.forEach(({ oscillator, gain }) => {
      try {
        const now = midiAudioContext?.currentTime || 0;
        gain?.gain?.cancelScheduledValues(now);
        gain?.gain?.setTargetAtTime?.(.0001, now, .012);
        oscillator.stop(now + .06);
      } catch { /* An oscillator that already ended needs no cleanup. */ }
    });
    midiSources = [];
  }

  function ensureMidiEqualizer() {
    if (!midiAudioContext) return;
    if (!midiMasterGain) {
      midiMasterGain = midiAudioContext.createGain(); midiMasterGain.gain.value = 1.55;
      midiCompressor = midiAudioContext.createDynamicsCompressor();
      midiCompressor.threshold.value = -12; midiCompressor.knee.value = 8; midiCompressor.ratio.value = 4;
      midiCompressor.attack.value = .004; midiCompressor.release.value = .12;
      midiCompressor.connect(midiAudioContext.destination);
    }
    if (midiEqFilters) return;
    const low = midiAudioContext.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 150;
    const mid = midiAudioContext.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.Q.value = .8;
    const high = midiAudioContext.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3500;
    midiMasterGain.connect(low); low.connect(mid); mid.connect(high);
    // Re-route the master chain through the three-band EQ without recreating voices.
    try { midiMasterGain.disconnect(midiCompressor); } catch { /* first initialization */ }
    high.connect(midiCompressor);
    midiEqFilters = { low, mid, high };
    applyMidiEq();
  }

  function applyMidiEq() {
    if (!midiEqFilters) return;
    midiEqFilters.low.gain.setTargetAtTime(midiEq.low, midiAudioContext.currentTime, .035);
    midiEqFilters.mid.gain.setTargetAtTime(midiEq.mid, midiAudioContext.currentTime, .035);
    midiEqFilters.high.gain.setTargetAtTime(midiEq.high, midiAudioContext.currentTime, .035);
  }

  function reportOutputSettings() {
    onMidiTransport({ state: 'settings', rate: midiPlaybackRate, eq: { ...midiEq }, audioAudible: midiBackingAudible });
  }

  async function playMidiNoteAt(midi, register, atSeconds, durationSeconds = .22, sourceLevel = 1,
    levelCurve = [], sourceStartMs = 0, playbackRate = 1) {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) throw new Error('Este navegador no ofrece Web Audio para la reproducción MIDI emulada.');
    midiAudioContext ||= new AudioContextType();
    ensureMidiEqualizer();
    if (midiAudioContext.state === 'suspended') await midiAudioContext.resume();
    const now = Math.max(midiAudioContext.currentTime + .005, atSeconds);
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const profile = midiInstrument === 'bass' || register === 'bass'
      ? [{ ratio: 1, gain: .24, type: 'triangle' }, { ratio: 2, gain: .055, type: 'sine' }]
      : midiInstrument === 'piano'
        ? [{ ratio: 1, gain: .18, type: 'triangle' }, { ratio: 2, gain: .08, type: 'sine' }, { ratio: 3, gain: .035, type: 'sine' }]
        : [{ ratio: 1, gain: .19, type: 'triangle' }, { ratio: 2, gain: .08, type: 'sine' }, { ratio: 3, gain: .028, type: 'sine' }];
    const filter = midiAudioContext.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(midiInstrument === 'bass' ? 1200 : 4200, now);
    const envelope = midiAudioContext.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    const gainForLevel = (value) => {
      const level = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
      // Keep quiet source passages audible while following their dynamics.
      return .88 * (.28 + .72 * Math.sqrt(level));
    };
    const endAt = now + Math.max(.09, durationSeconds);
    const releaseAt = Math.max(now + .012, endAt - .025);
    let lastGain = gainForLevel(sourceLevel);
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.linearRampToValueAtTime(lastGain, now + .012);
    (levelCurve || []).forEach((point) => {
      if (!Number.isFinite(point.timeMs) || point.timeMs <= sourceStartMs) return;
      const at = now + (point.timeMs - sourceStartMs) / (1000 * Math.max(.01, playbackRate));
      if (at >= releaseAt) return;
      lastGain = gainForLevel(point.level);
      envelope.gain.linearRampToValueAtTime(lastGain, Math.max(now + .013, at));
    });
    envelope.gain.setValueAtTime(lastGain, releaseAt);
    envelope.gain.linearRampToValueAtTime(.0001, endAt);
    filter.connect(envelope); envelope.connect(midiMasterGain);
    profile.forEach((partial) => {
      const oscillator = midiAudioContext.createOscillator();
      const partialGain = midiAudioContext.createGain();
      oscillator.type = partial.type; oscillator.frequency.setValueAtTime(frequency * partial.ratio, now);
      partialGain.gain.setValueAtTime(partial.gain, now);
      oscillator.connect(partialGain); partialGain.connect(filter);
      oscillator.start(now); oscillator.stop(now + Math.max(.1, durationSeconds) + .02);
      midiSources.push({ oscillator, gain: partialGain });
      oscillator.addEventListener('ended', () => { midiSources = midiSources.filter((source) => source.oscillator !== oscillator); }, { once: true });
    });
    midiSources.push({ oscillator: { stop: () => {} }, gain: envelope });
  }

  function animateMidiCursor(startMs, endMs) {
    if (midiAnimation !== null) cancelAnimationFrame(midiAnimation);
    const tick = (now) => {
      if (!midiPlaybackClock) return;
      playbackPositionMs = Math.min(endMs, midiPlaybackClock.startMs + (now - midiPlaybackClock.startedAt) * midiPlaybackClock.rate);
      const parts = getSegments();
      const active = parts.find((part) => playbackPositionMs >= part.startMs && playbackPositionMs < part.endMs) || parts[selectedIndex];
      const activeIndex = parts.indexOf(active);
      if (activeIndex !== midiActiveSegmentIndex) {
        list.children[midiActiveSegmentIndex]?.classList.remove('is-midi-playing');
        list.children[activeIndex]?.classList.add('is-midi-playing');
        if (activeIndex >= 0 && activeIndex !== selectedIndex) {
          selectedIndex = activeIndex;
          renderDetail({ preserveMidiPlayback: true, preserveScroll: true, detailOnly: true });
          updateSelectionButtons();
          list.children[activeIndex]?.classList.add('is-midi-playing');
        }
        midiActiveSegmentIndex = activeIndex;
      }
      midiVoiceState?.setPlayhead?.(active, playbackPositionMs);
      harmonicVisualization?.update(active, playbackPositionMs, liveFrame);
      refreshSpectralOverlay(); drawOverview(); midiVoiceState?.draw?.();
      if (playbackPositionMs < endMs) midiAnimation = requestAnimationFrame(tick);
      else finishMidiPlayback();
    };
    midiAnimation = requestAnimationFrame(tick);
  }

  function getMidiEvents(startMs, endMs, register = midiRegister, mode = midiMode) {
    const tracks = extractMidiVoices(analysis.spectralFrames || [], { startMs: 0, endMs: analysis.durationMs,
      manualNotes: analysis.manualMidiNotes || [], waveform: analysis.waveform || [], durationMs: analysis.durationMs });
    return selectMidiPlaybackEvents(tracks, { startMs, endMs, register, mode });
  }

  function scheduleMidiWindow() {
    if (!midiPlaybackClock || !midiAudioContext) return;
    const position = Math.min(midiPlaybackClock.endMs,
      midiPlaybackClock.startMs + (performance.now() - midiPlaybackClock.startedAt) * midiPlaybackClock.rate);
    midiPlaybackClock.positionMs = position;
    const horizon = position + 120 * midiPlaybackClock.rate;
    while (midiPlaybackClock.cursor < midiPlaybackClock.events.length
      && midiPlaybackClock.events[midiPlaybackClock.cursor].startMs <= horizon) {
      const event = midiPlaybackClock.events[midiPlaybackClock.cursor++];
      if (event.endMs <= position) continue;
      const noteStart = Math.max(position, event.startMs);
      const at = midiAudioContext.currentTime + Math.max(.008, (noteStart - position) / (1000 * midiPlaybackClock.rate));
      const duration = Math.max(.075, (event.endMs - noteStart) / (1000 * midiPlaybackClock.rate));
      const levels = event.levels || [];
      const initialLevel = [...levels].reverse().find((point) => point.timeMs <= noteStart)?.level ?? event.level;
      const curve = levels.filter((point) => point.timeMs > noteStart && point.timeMs < event.endMs);
      playMidiNoteAt(event.midi, event.register, at, duration, initialLevel, curve, noteStart, midiPlaybackClock.rate).catch(() => {});
    }
  }

  function finishMidiPlayback({ reset = false } = {}) {
    const selectedSegment = getSegments()[selectedIndex];
    const positionMs = reset ? (selectedSegment?.startMs || 0) : midiPlaybackClock?.endMs ?? playbackPositionMs;
    stopMidiPlayback();
    midiPaused = false;
    playbackPositionMs = positionMs;
    onMidiTransport({ state: reset ? 'stopped' : 'ended', positionMs, audioAudible: midiBackingAudible });
    if (reset) onSeek(positionMs);
    drawOverview(); midiVoiceState?.draw?.();
    if (midiVoiceState?.status) midiVoiceState.status.textContent = reset ? 'Reproducción MIDI detenida · cursor al inicio.' : 'Fin de la reproducción MIDI.';
    midiVoiceState?.updateControls?.();
  }

  async function startMidiPlayback({ resume = false, register = midiRegister, mode = midiMode } = {}) {
    if (!analysis) return;
    const segment = getSegments()[selectedIndex];
    const startMs = resume ? playbackPositionMs : segment?.startMs || 0;
    const endMs = midiScope === 'segment' && segment ? segment.endMs : analysis.durationMs;
    const events = getMidiEvents(startMs, endMs, register, mode);
    if (!events.length) {
      if (midiVoiceState?.status) midiVoiceState.status.textContent = 'No hay notas MIDI estimadas para esta selección.';
      return;
    }
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) throw new Error('Web Audio no está disponible en este navegador.');
      midiAudioContext ||= new AudioContextType();
      if (midiAudioContext.state === 'suspended') await midiAudioContext.resume();
      stopMidiPlayback();
      midiPaused = false;
      midiRegister = register; midiMode = mode;
      playbackPositionMs = startMs;
      onMidiTransport({ state: 'playing', positionMs: startMs, audioAudible: midiBackingAudible });
      midiPlaybackClock = { startedAt: performance.now(), startMs, endMs, positionMs: startMs, rate: midiPlaybackRate,
        events, cursor: events.findIndex((event) => event.endMs > startMs) };
      if (midiPlaybackClock.cursor < 0) midiPlaybackClock.cursor = events.length;
      scheduleMidiWindow();
      midiTickTimer = setInterval(scheduleMidiWindow, 35);
      if (midiVoiceState?.status) midiVoiceState.status.textContent = `Reproduciendo ${mode === 'all' ? 'todas las líneas' : `línea ${register}`} · ${midiScope === 'song' ? 'pieza completa' : 'tramo'} · ${events.length} notas · ${midiInstrument}.`;
      animateMidiCursor(startMs, endMs);
      midiVoiceState?.updateControls?.();
    } catch (error) {
      if (midiVoiceState?.status) midiVoiceState.status.textContent = error?.message || 'No se pudo iniciar el sonido MIDI.';
    }
  }

  function pauseMidiPlayback() {
    if (!midiPlaybackClock) return;
    playbackPositionMs = Math.min(midiPlaybackClock.endMs,
      midiPlaybackClock.startMs + (performance.now() - midiPlaybackClock.startedAt) * midiPlaybackClock.rate);
    stopMidiPlayback();
    midiPaused = true;
    onMidiTransport({ state: 'paused', positionMs: playbackPositionMs, audioAudible: midiBackingAudible });
    if (midiVoiceState?.status) midiVoiceState.status.textContent = `MIDI en pausa · ${timeLabel(playbackPositionMs)}.`;
    drawOverview(); midiVoiceState?.draw?.(); midiVoiceState?.updateControls?.();
  }

  function renderMidiVoicePanel(segment) {
    midiVoicePanel.replaceChildren();
    if (!segment) { midiVoicePanel.append(node('p', 'analysis-empty', 'Selecciona un tramo para construir sus líneas de notas.')); return; }
    const heading = node('div', 'analysis-midi-heading');
    const titleBlock = node('div');
    titleBlock.append(node('h4', '', 'Líneas MIDI · notas estimadas en el tiempo'));
    titleBlock.append(node('p', 'analysis-midi-help', 'Desde el tramo elegido, MIDI continúa por los siguientes hasta el final; activa «Solo tramo» para acotarlo. Elige todas las voces o una línea, con o sin la pista original. El sonido es una emulación local.'));
    const instrumentLabel = node('label', 'analysis-midi-instrument', 'Sonido ');
    const instrumentSelect = node('select');
    [['guitar', 'Guitarra emulada'], ['bass', 'Bajo emulado'], ['piano', 'Piano emulado']].forEach(([value, label]) => instrumentSelect.add(new Option(label, value)));
    instrumentSelect.value = midiInstrument;
    instrumentSelect.addEventListener('change', () => { midiInstrument = instrumentSelect.value; });
    instrumentLabel.append(instrumentSelect);
    heading.append(titleBlock, instrumentLabel); midiVoicePanel.append(heading);
    const transport = node('div', 'analysis-midi-transport');
    const playButton = node('button', 'analysis-midi-play-control', midiPaused ? '▶ Reanudar MIDI' : '▶ Reproducir MIDI'); playButton.type = 'button';
    const pauseButton = node('button', 'analysis-midi-pause', 'Ⅱ Pausar'); pauseButton.type = 'button';
    const stopButton = node('button', 'analysis-midi-stop', '■ Detener'); stopButton.type = 'button';
    const totalLabel = node('label', 'analysis-midi-switch');
    const totalSwitch = node('input'); totalSwitch.type = 'checkbox'; totalSwitch.checked = midiMode === 'all'; totalSwitch.setAttribute('role', 'switch');
    totalLabel.append(totalSwitch, node('span', '', 'Total · todas las voces'));
    const lineLabel = node('label', 'analysis-midi-option', 'Línea ');
    const lineSelect = node('select');
    [['bass', 'Bajo'], ['middle', 'Medio'], ['high', 'Agudos']]
      .forEach(([value, label]) => lineSelect.add(new Option(label, value)));
    lineSelect.value = midiRegister;
    lineSelect.disabled = midiMode === 'all';
    totalSwitch.addEventListener('change', () => {
      midiMode = totalSwitch.checked ? 'all' : 'line';
      lineSelect.disabled = totalSwitch.checked;
      midiVoiceState?.updateControls?.();
    });
    lineSelect.addEventListener('change', () => {
      midiRegister = lineSelect.value;
      midiVoiceState?.updateControls?.();
    });
    lineLabel.append(lineSelect);
    const scopeLabel = node('label', 'analysis-midi-switch');
    const scopeSwitch = node('input'); scopeSwitch.type = 'checkbox'; scopeSwitch.checked = midiScope === 'segment'; scopeSwitch.setAttribute('role', 'switch');
    scopeLabel.append(scopeSwitch, node('span', '', 'Solo tramo seleccionado'));
    scopeSwitch.addEventListener('change', () => { midiScope = scopeSwitch.checked ? 'segment' : 'song'; });
    const backingLabel = node('label', 'analysis-midi-switch');
    const backingSwitch = node('input'); backingSwitch.type = 'checkbox'; backingSwitch.checked = midiBackingAudible; backingSwitch.setAttribute('role', 'switch');
    backingLabel.append(backingSwitch, node('span', '', 'Pista original audible'));
    backingSwitch.addEventListener('change', () => {
      midiBackingAudible = backingSwitch.checked;
      onMidiTransport({ state: midiPlaybackClock ? 'playing' : midiPaused ? 'paused' : 'stopped',
        positionMs: playbackPositionMs, audioAudible: midiBackingAudible });
    });
    playButton.addEventListener('click', () => startMidiPlayback({ resume: midiPaused }).catch(() => {}));
    pauseButton.addEventListener('click', pauseMidiPlayback);
    stopButton.addEventListener('click', () => finishMidiPlayback({ reset: true }));
    const speedLabel = node('label', 'analysis-midi-option', 'Velocidad ');
    const speed = node('input', 'analysis-midi-speed'); speed.type = 'range'; speed.min = '.35'; speed.max = '1'; speed.step = '.05'; speed.value = String(midiPlaybackRate);
    const speedValue = node('output', 'analysis-midi-speed-value', `${midiPlaybackRate.toFixed(2)}×`);
    speedLabel.append(speed, speedValue);
    speed.addEventListener('input', () => {
      midiPlaybackRate = Number(speed.value); speedValue.value = `${midiPlaybackRate.toFixed(2)}×`; speedValue.textContent = speedValue.value;
      if (midiPlaybackClock) {
        const now = performance.now();
        playbackPositionMs = Math.min(midiPlaybackClock.endMs, midiPlaybackClock.startMs + (now - midiPlaybackClock.startedAt) * midiPlaybackClock.rate);
        midiPlaybackClock.startMs = playbackPositionMs; midiPlaybackClock.positionMs = playbackPositionMs;
        midiPlaybackClock.startedAt = now; midiPlaybackClock.rate = midiPlaybackRate;
      }
      reportOutputSettings();
    });
    const eqDetails = node('details', 'analysis-midi-eq');
    const eqSummary = node('summary', '', 'Ecualizador de salida · graves / medios / agudos'); eqDetails.append(eqSummary);
    const eqCanvas = node('canvas', 'analysis-midi-eq-curve'); eqCanvas.width = 520; eqCanvas.height = 90;
    const eqControls = node('div', 'analysis-midi-eq-controls');
    const drawEqCurve = () => {
      const ctx = eqCanvas.getContext('2d'), { width, height } = eqCanvas;
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#07100c'; ctx.fillRect(0, 0, width, height);
      const midY = height / 2, dbRange = 24;
      ctx.strokeStyle = '#385046'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(12, midY); ctx.lineTo(width - 12, midY); ctx.stroke();
      const response = (x) => {
        const lowWeight = 1 / (1 + Math.exp((x - .23) * 26));
        const midWeight = Math.exp(-(((x - .51) / .13) ** 2));
        const highWeight = 1 / (1 + Math.exp(-((x - .76) * 26)));
        return midiEq.low * lowWeight + midiEq.mid * midWeight + midiEq.high * highWeight;
      };
      ctx.strokeStyle = '#67dbc0'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < width - 24; x++) {
        const db = response(x / (width - 24)); const y = midY - db / dbRange * (height * .43);
        if (!x) ctx.moveTo(12 + x, y); else ctx.lineTo(12 + x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#a9b9ad'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('60 Hz', 12, height - 5);
      ctx.textAlign = 'center'; ctx.fillText('900 Hz', width / 2, height - 5); ctx.textAlign = 'right'; ctx.fillText('8 kHz', width - 12, height - 5);
    };
    [['low', 'Graves · 150 Hz'], ['mid', 'Medios · 900 Hz'], ['high', 'Agudos · 3.5 kHz']].forEach(([key, label]) => {
      const control = node('label', 'analysis-midi-eq-band', label);
      const input = node('input'); input.type = 'range'; input.min = '-24'; input.max = '6'; input.step = '1'; input.value = String(midiEq[key]);
      const value = node('output', '', `${midiEq[key]} dB`);
      input.addEventListener('input', () => {
        midiEq[key] = Number(input.value); value.value = `${midiEq[key]} dB`; value.textContent = value.value;
        ensureMidiEqualizer(); applyMidiEq(); drawEqCurve(); reportOutputSettings();
      });
      control.append(input, value); eqControls.append(control);
    });
    drawEqCurve(); eqDetails.append(eqCanvas, eqControls);
    transport.append(playButton, pauseButton, stopButton, totalLabel, lineLabel, scopeLabel, backingLabel, speedLabel);
    midiVoicePanel.append(transport);
    const tracks = extractMidiVoices(analysis.spectralFrames || [], { startMs: 0, endMs: analysis.durationMs,
      manualNotes: analysis.manualMidiNotes || [], waveform: analysis.waveform || [], durationMs: analysis.durationMs });
    const ranges = { bass: [28, 47], middle: [48, 71], high: [72, 96] };
    const names = { bass: 'Bajo', middle: 'Medio', high: 'Agudos' };
    const rowRefs = [];
    const localDuration = Math.max(1, analysis.durationMs);
    const noteName = (midi) => `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
    for (const register of ['bass', 'middle', 'high']) {
      const row = node('div', `analysis-midi-row is-${register}`);
      const label = node('div', 'analysis-midi-row-label');
      label.append(node('strong', '', names[register]));
      const listen = node('button', 'analysis-midi-play', `▶ ${names[register]}`); listen.type = 'button';
      listen.addEventListener('click', () => {
        midiRegister = register; midiMode = 'line'; totalSwitch.checked = false;
        lineSelect.value = register; lineSelect.disabled = false;
        startMidiPlayback({ register, mode: 'line' });
      }); label.append(listen);
      const canvas = node('canvas', 'analysis-midi-lane');
      canvas.setAttribute('role', 'button'); canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', `Línea MIDI de ${names[register]} para el tramo. Haz clic para escuchar la nota cercana.`);
      const [minMidi, maxMidi] = ranges[register];
      const draw = () => {
        const rect = canvas.getBoundingClientRect(); if (!rect.width) return;
        const ratio = window.devicePixelRatio || 1, width = Math.max(260, Math.floor(rect.width)), height = 82;
        canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio);
        const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#07100c'; ctx.fillRect(0, 0, width, height);
        const left = 40, right = width - 8, top = 7, bottom = height - 15;
        ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'right';
        for (let midi = minMidi; midi <= maxMidi; midi += 12) {
          const y = bottom - (midi - minMidi) / (maxMidi - minMidi) * (bottom - top);
          ctx.strokeStyle = 'rgba(165,190,173,.16)'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
          ctx.fillStyle = '#a9baad'; ctx.fillText(noteName(midi), left - 5, y + 3);
        }
        const selectionStart = segment.startMs / localDuration * (right - left) + left;
        const selectionEnd = segment.endMs / localDuration * (right - left) + left;
        ctx.fillStyle = 'rgba(242,246,111,.055)'; ctx.fillRect(selectionStart, top, selectionEnd - selectionStart, bottom - top);
        const activeSegment = getSegments().find((part) => playbackPositionMs >= part.startMs && playbackPositionMs < part.endMs);
        if (activeSegment) {
          const activeLeft = left + activeSegment.startMs / localDuration * (right - left);
          const activeRight = left + activeSegment.endMs / localDuration * (right - left);
          ctx.strokeStyle = '#ffad65'; ctx.lineWidth = 1; ctx.strokeRect(activeLeft, top, Math.max(2, activeRight - activeLeft), bottom - top);
        }
        tracks[register].forEach((event) => {
          const x = left + event.startMs / localDuration * (right - left);
          const w = Math.max(2, (event.endMs - event.startMs) / localDuration * (right - left));
          const y = bottom - (event.midi - minMidi) / (maxMidi - minMidi) * (bottom - top);
          ctx.fillStyle = event.source === 'manual' ? '#eff47c' : register === 'bass' ? '#eda652' : register === 'middle' ? '#54d8bf' : '#df80c2';
          ctx.globalAlpha = event.source === 'manual' ? .95 : Math.max(.5, Math.min(1, event.strength || .5));
          ctx.fillRect(x, y - 3, w, 6); ctx.globalAlpha = 1;
          if (w > 24) { ctx.fillStyle = '#e9f2e9'; ctx.textAlign = 'left'; ctx.fillText(noteName(event.midi), x + 3, y - 5); }
        });
        const cursor = left + Math.max(0, Math.min(analysis.durationMs, playbackPositionMs)) / localDuration * (right - left);
        ctx.strokeStyle = '#f2f66f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cursor, top); ctx.lineTo(cursor, bottom); ctx.stroke();
        ctx.fillStyle = '#9bada0'; ctx.font = '8px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText('0:00', left, height - 3);
        ctx.textAlign = 'right'; ctx.fillText(timeLabel(analysis.durationMs), right, height - 3);
      };
      const chooseAt = async (event) => {
        const rect = canvas.getBoundingClientRect(), left = 40, right = Math.max(left + 1, rect.width - 8);
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - left) / (right - left)));
        const timeMs = ratio * localDuration;
        const nearest = tracks[register].reduce((best, item) => !best || Math.abs(item.startMs - timeMs) < Math.abs(best.startMs - timeMs) ? item : best, null);
        const picked = nearest && Math.abs(nearest.startMs - timeMs) <= Math.max(220, localDuration * .035) ? nearest : null;
        if (midiPlaybackClock) pauseMidiPlayback();
        playbackPositionMs = timeMs; onSeek(timeMs); harmonicVisualization?.update(segment, timeMs, liveFrame);
        refreshSpectralOverlay(); drawOverview(); midiVoiceState?.draw?.();
        if (picked) {
          try { await playMidiNoteAt(picked.midi, register, (midiAudioContext?.currentTime || 0) + .02, .38); }
          catch (error) { midiVoiceState.status.textContent = error?.message || 'No se pudo tocar la nota.'; }
          if (midiVoiceState?.status) midiVoiceState.status.textContent = `${noteName(picked.midi)} · ${names[register]} · ${picked.source === 'manual' ? 'nota agregada' : 'pico estimado'} · ${timeLabel(picked.startMs)}`;
        } else if (midiVoiceState?.status) midiVoiceState.status.textContent = `Cursor en ${timeLabel(timeMs)} · no hay nota estimada en ese punto.`;
      };
      canvas.addEventListener('click', chooseAt);
      canvas.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') chooseAt({ clientX: canvas.getBoundingClientRect().left + 44, clientY: 0 }); });
      row.append(label, canvas); midiVoicePanel.append(row); rowRefs.push(draw);
    }
    const manualNotes = (analysis.manualMidiNotes || []).filter((item) => item.timeMs >= segment.startMs && item.timeMs < segment.endMs);
    const manualList = node('div', 'analysis-midi-manual-list');
    if (manualNotes.length) {
      manualList.append(node('span', '', 'Notas agregadas:'));
      manualNotes.forEach((item) => {
        const remove = node('button', 'analysis-midi-note-chip', `× ${noteName(item.midi)} · ${timeLabel(item.timeMs)}`); remove.type = 'button';
        remove.setAttribute('aria-label', `Quitar nota ${noteName(item.midi)} agregada en ${timeLabel(item.timeMs)}`);
        remove.addEventListener('click', () => { analysis.manualMidiNotes = analysis.manualMidiNotes.filter((note) => note.id !== item.id); onChange(); renderDetail(); });
        manualList.append(remove);
      });
    } else manualList.append(node('span', '', 'Todavía no hay notas editadas en este tramo.'));
    midiVoicePanel.append(eqDetails, manualList);
    const status = node('p', 'analysis-midi-status', 'Las alturas son estimaciones del espectro. Elige una línea para escucharla o selecciona «Total · todas»; el control de transporte continúa al siguiente tramo.');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); midiVoicePanel.append(status);
    const liveReadout = node('div', 'analysis-midi-live-readout');
    liveReadout.setAttribute('aria-live', 'off');
    const livePosition = node('strong', '', 'Esperando reproducción');
    const liveHarmony = node('span', '', 'Armonía: —');
    const liveNotes = node('span', '', 'Bajo: — · Medio: — · Agudos: —');
    liveReadout.append(livePosition, liveHarmony, liveNotes); midiVoicePanel.insertBefore(liveReadout, transport);
    const noteNameForRegister = (register, positionMs) => {
      const frame = spectralFrameAt(analysis, positionMs);
      const range = ranges[register];
      const peak = (frame?.peaks || []).filter((item) => Number.isFinite(item.midi)
        && item.midi >= range[0] && item.midi <= range[1])
        .sort((left, right) => (right.strength || 0) - (left.strength || 0))[0];
      return peak ? noteName(peak.midi) : '—';
    };
    let lastReadout = '';
    const setPlayhead = (active, positionMs) => {
      const partIndex = getSegments().indexOf(active);
      const harmony = active?.isSilence ? 'silencio detectado' : active?.selectedSymbol || active?.symbol || 'sin acorde claro';
      const notes = ['bass', 'middle', 'high'].map((register) => noteNameForRegister(register, positionMs));
      const text = `${timeLabel(positionMs)} · ${partIndex >= 0 ? `tramo ${partIndex + 1}` : 'reproduciendo'} · ${harmony} · ${notes.join(' · ')}`;
      if (text === lastReadout) return;
      lastReadout = text;
      livePosition.textContent = `${timeLabel(positionMs)} · ${partIndex >= 0 ? `tramo ${partIndex + 1}` : 'reproduciendo'}`;
      liveHarmony.textContent = `Armonía: ${harmony}`;
      liveNotes.textContent = `Bajo: ${notes[0]} · Medio: ${notes[1]} · Agudos: ${notes[2]}`;
    };
    midiVoiceState = { status, draw: () => rowRefs.forEach((draw) => draw()), setPlayhead, updateControls: () => {
      const playing = Boolean(midiPlaybackClock);
      playButton.disabled = playing;
      playButton.textContent = midiPaused ? '▶ Reanudar MIDI' : '▶ Reproducir MIDI';
      pauseButton.disabled = !playing;
      stopButton.disabled = !playing && !midiPaused;
      totalSwitch.disabled = playing;
      lineSelect.disabled = playing || midiMode === 'all';
      scopeSwitch.disabled = playing;
    } };
    if (midiPlaybackClock) status.textContent = `MIDI en reproducción · ${timeLabel(playbackPositionMs)} · continúa a través de los tramos.`;
    else if (midiPaused) status.textContent = `MIDI en pausa · ${timeLabel(playbackPositionMs)}.`;
    midiVoiceState.draw();
    midiVoiceState.updateControls();
  }

  function renderDetail({ preserveMidiPlayback = false, preserveScroll = false, detailOnly = false } = {}) {
    const savedScroll = preserveScroll ? { x: window.scrollX, y: window.scrollY } : null;
    const restoreScroll = () => {
      if (savedScroll) requestAnimationFrame(() => window.scrollTo(savedScroll.x, savedScroll.y));
    };
    if (!preserveMidiPlayback && midiPlaybackClock) pauseMidiPlayback();
    detail.replaceChildren();
    if (!detailOnly) {
      list.replaceChildren();
      midiActiveSegmentIndex = -1;
      midiVoicePanel.replaceChildren();
      harmonicHistoryHost.replaceChildren();
      circleWidgetHost.replaceChildren();
      refreshSpectralOverlay = () => {};
      lastSpectralPitchSignature = '';
    }
    const segments = getSegments();
    if (!detailOnly) {
      listHeading.textContent = beatView.checked
        ? 'Evidencia de cada golpe (el acorde se elige en el tramo) · ←/→ navegar' : 'Tramos armónicos y silencios · ←/→ navegar';
      segments.forEach((segment, index) => {
        const chosen = segment.isSilence ? 'Silencio' : segment.selectedSymbol ? `✓ ${segment.selectedSymbol}` : (segment.symbol ? `¿${segment.symbol}?` : 'Sin acorde');
        const stability = beatView.checked ? `golpe ${(segment.beatIndex ?? index) + 1}` : `${Math.round(segment.stabilityMs || segment.endMs - segment.startMs)} ms estable`;
        const item = node('button', 'analysis-segment', `${index + 1} · ${timeLabel(segment.startMs)}–${timeLabel(segment.endMs)} · ${chosen} · ${stability}`);
        item.type = 'button'; item.setAttribute('aria-current', index === selectedIndex ? 'true' : 'false');
        item.addEventListener('click', () => {
          selectedIndex = index;
          if (midiPlaybackClock) updateSelectionButtons();
          else {
            playbackPositionMs = segment.startMs;
            renderDetail();
            onSelect(segment);
          }
        });
        list.append(item);
      });
    } else updateSelectionButtons();
    const segment = segments[selectedIndex];
    if (!detailOnly) { harmonicVisualization?.dispose(); harmonicVisualization = null; drawOverview(); }
    if (!segment) {
      detail.append(node('p', '', 'No se obtuvieron tramos para visualizar.'));
      if (!detailOnly) renderMidiVoicePanel(null);
      restoreScroll(); return;
    }

    const symbol = segment.isSilence ? '' : segment.selectedSymbol || segment.symbol || '';
    detail.append(node('h4', '', `Tramo ${selectedIndex + 1} · ${timeLabel(segment.startMs)}–${timeLabel(segment.endMs)}`));
    const confidence = Math.max(0, Math.min(1, Number(segment.confidence) || 0));
    const confidenceTier = confidence >= 0.72 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
    const chordCard = node('div', `analysis-chord-card ${segment.isSilence ? 'is-low' : segment.selectedSymbol ? 'is-defined' : `is-${confidenceTier}`}`);
    chordCard.append(node('div', 'analysis-chord-card-heading', segment.isSilence
      ? 'Silencio detectado · sin acorde'
      : segment.selectedSymbol
      ? `Acorde definido · ${segment.selectedSymbol}`
      : symbol ? `Acorde aproximado · ${segment.symbol}` : 'Acorde aproximado · sin propuesta clara'));
    const meterLabel = node('div', 'analysis-confidence-label', segment.isSilence
      ? 'Energía por debajo del umbral de silencio' : segment.selectedSymbol
        ? 'Confirmado manualmente'
        : `Coincidencia orientativa · ${Math.round(confidence * 100)}%`);
    const meter = node('div', 'analysis-confidence-track');
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', segment.isSilence ? 'Silencio detectado; no hay acorde propuesto'
      : segment.selectedSymbol ? 'Acorde definido manualmente' : `Ajuste orientativo ${Math.round(confidence * 100)} por ciento`);
    const meterFill = node('span', 'analysis-confidence-fill');
    meterFill.style.width = `${segment.isSilence ? 0 : segment.selectedSymbol ? 100 : confidence * 100}%`;
    meter.append(meterFill); chordCard.append(meterLabel, meter); detail.append(chordCard);
    const tentative = analysis.harmony ? confidence < 0.6 : !segment.accepted;
    if (symbol && tentative && !segment.selectedSymbol) {
      chordCard.append(node('p', 'analysis-approximate-note', 'Propuesta cercana: la huella se parece, pero otras armonías también encajan. Puedes escucharla, compararla o corregirla.'));
    }
    if (segment.evidence) {
      const evidence = segment.evidence;
      const percent = (value) => `${Math.round((Number(value) || 0) * 100)} %`;
      const note = node('p', 'analysis-boundary-evidence', evidence.method === 'nnls-hmm'
        ? `Pista armónica v6 · ${evidence.steps} pasos de análisis · confianza ${percent(segment.confidence)} · color ${percent(segment.qualityConfidence)}`
          + ` · bajo fiable ${percent(evidence.bassReliability)} (dominante ${percent(evidence.bassShare)})`
          + `${evidence.color?.length ? ` · nota de color sostenida ${evidence.color.map((item) => `${PITCH_NAMES[item.pitchClass]} ${percent(item.sustainedFraction)}`).join(' · ')}` : ''}`
          + ` · fuerza del cambio ${percent(segment.boundaryStrength)}${segment.source === 'user' ? ' · elegido por vos' : segment.confirmed ? ' · confirmado' : ''}`
        : evidence.method === 'beat-evidence'
        ? `Golpe ${evidence.beatIndex} · tempo ${evidence.tempoBpm} BPM (confianza rítmica ${evidence.rhythmConfidence}) · ataque excluido ${segment.transientSkippedMs} ms`
          + `${evidence.onsetNearBeat ? ' · ataque detectado junto al golpe' : ''} · ${evidence.analyzedFrames} ventanas FFT`
          + ` · notas fuertes ${evidence.strongestPitchClasses?.join(' · ') || 'sin señal'} · bajo ${evidence.bassNotes?.join(' · ') || 'no disponible'}`
          + ` · acorde de la pista armónica ${segment.symbol || 'ninguno'}`
        : segment.isSilence
        ? `Silencio sostenido · ${evidence.frames || evidence.analyzedFrames || 0} ventanas FFT · umbral RMS ${Number.isFinite(evidence.silenceThresholdRms) ? evidence.silenceThresholdRms.toExponential(1) : 'automático'}`
        : evidence.method === 'post-beat harmonic reanalysis'
        ? `Prueba por audio · golpe ${evidence.beatIndex} · tempo ${evidence.tempoBpm} BPM (confianza rítmica ${Math.round((evidence.rhythmConfidence || 0) * 100)}%) · ataque excluido ${evidence.transientSkippedMs} ms${evidence.onsetNearBeat ? ' · onset detectado junto al golpe' : ''} · ${evidence.analyzedFrames} ventanas FFT / ${evidence.analyzedDurationMs} ms · croma dominante ${evidence.strongestPitchClasses?.join(' · ') || 'sin señal'} · guía de bajo ${evidence.bassGuide || 'no disponible'} · tonos del acorde presentes ${evidence.supportedChordTones?.join(' · ') || 'ninguno'} de ${evidence.candidateTones?.join(' · ') || 'sin plantilla'} · cobertura ${Math.round((evidence.chordCoverage || 0) * 100)}% · ajuste ${Math.round((evidence.score || 0) * 100)}% · margen ${evidence.margin?.toFixed(3) ?? '0.000'}${evidence.closeAlternatives?.length ? ` · candidatos ${evidence.closeAlternatives.map((item) => `${item.symbol} ${Math.round(item.score * 100)}%`).join(' / ')}` : ''}`
        : `Estable ${((segment.stabilityMs || segment.endMs - segment.startMs) / 1000).toFixed(1)} s · ${evidence.changedPitchClasses || 0} clases de croma · ${evidence.changedSpectralPitches || 0} cambios de picos armónicos${evidence.bassChanged ? ' · cambió el bajo' : ''}`);
      chordCard.append(note);
    }
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
    // Per-beat evidence is read-only: decisions go into the single harmony track.
    const readOnlyBeat = Boolean(analysis.harmony) && beatView.checked;
    chordSelect.disabled = Boolean(segment.isSilence) || readOnlyBeat;
    chordSelect.add(new Option(analysis.harmony ? '— Automático (sin confirmar) —' : '— Dejar sin asignar —', ''));
    if (analysis.harmony && segment.autoSymbol && segment.source !== 'user' && !readOnlyBeat) {
      const group = Object.assign(document.createElement('optgroup'), { label: 'Propuesta del motor' });
      group.append(new Option(`Confirmar ${segment.autoSymbol}`, segment.autoSymbol));
      chordSelect.add(group);
    }
    const alternatives = (segment.alternatives || []).filter((candidate) => candidate.symbol !== segment.autoSymbol);
    if (alternatives.length) {
      const group = Object.assign(document.createElement('optgroup'), { label: 'Otras lecturas de este tramo' });
      alternatives.forEach((candidate) => group.append(new Option(candidate.reason
        ? `${candidate.symbol} · ${ALTERNATIVE_REASONS[candidate.reason] || candidate.reason}` : `${candidate.symbol} · ${candidate.score.toFixed(3)}`, candidate.symbol)));
      chordSelect.add(group);
    }
    const manualGroup = Object.assign(document.createElement('optgroup'), { label: 'Elegir manualmente' });
    CHORDS.forEach((symbol) => manualGroup.append(new Option(symbol, symbol)));
    chordSelect.add(manualGroup);
    chordSelect.value = segment.isSilence || readOnlyBeat ? '' : segment.selectedSymbol || '';
    activeChordSelect = chordSelect;
    chordSelect.addEventListener('change', () => {
      if (analysis.harmony) {
        const { startMs, endMs, autoSymbol, source } = segment;
        const value = chordSelect.value;
        editAnalysisHarmony(analysis, !value ? { type: 'clear', startMs, endMs }
          : value === autoSymbol && source !== 'user' ? { type: 'confirm', startMs, endMs } : { type: 'label', startMs, endMs, symbol: value });
        selectedIndex = indexAt(startMs);
      } else {
        segment.selectedSymbol = chordSelect.value;
        segment.selectionSource = chordSelect.value ? 'manual' : 'unassigned';
        segment.accepted = Boolean(chordSelect.value);
      }
      onChange();
      renderDetail();
    });
    label.append(chordSelect); controls.append(label);
    if (readOnlyBeat) controls.append(node('p', 'analysis-approximate-note', 'Esta vista muestra qué sonó en cada golpe. Para corregir el acorde, desmarca «Evidencia por golpe» y elige el tramo.'));
    controls.hidden = false;
    detail.append(controls);

    const graph = node('div', 'analysis-detail-grid');
    const comparison = node('section', 'analysis-detail-card analysis-chord-comparison');
    comparison.append(node('strong', '', segment.isSilence
      ? 'Huella del tramo · silencio detectado'
      : `Huella del tramo · audio real vs ${symbol || 'acorde sin definir'}`));
    const legend = node('div', 'analysis-comparison-legend');
    legend.append(node('span', 'comparison-legend-audio', 'Audio observado'), node('span', 'comparison-legend-chord', 'Perfil del acorde'));
    comparison.append(legend);
    const chordData = symbol ? getChordTones(symbol) : { recognized: false, tones: [] };
    const tones = new Set(chordData.tones);
    const observed = segment.chroma || Array(12).fill(0);
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('viewBox', '0 0 720 238');
    chart.setAttribute('role', 'img');
    chart.setAttribute('class', 'analysis-comparison-chart');
    chart.setAttribute('aria-label', chordData.recognized
      ? `Comparación de energía observada y notas esperadas para ${symbol} entre ${timeLabel(segment.startMs)} y ${timeLabel(segment.endMs)}`
      : `Energía observada por nota entre ${timeLabel(segment.startMs)} y ${timeLabel(segment.endMs)}; selecciona un acorde para compararlo`);
    const svgNode = (tag, attrs = {}, text = '') => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
      if (text) element.textContent = text;
      return element;
    };
    const left = 42, right = 708, top = 18, bottom = 194;
    const xAt = (pitch) => left + pitch * ((right - left) / 11);
    const yAt = (value) => bottom - Math.max(0, Math.min(1, value)) * (bottom - top);
    [0, .25, .5, .75, 1].forEach((value) => {
      const y = yAt(value);
      chart.append(svgNode('line', { x1: left, y1: y, x2: right, y2: y, class: 'comparison-gridline' }));
      chart.append(svgNode('text', { x: left - 8, y: y + 3, class: 'comparison-axis-label', 'text-anchor': 'end' }, `${Math.round(value * 100)}`));
    });
    const targetPoints = [];
    const audioPoints = [];
    PITCH_NAMES.forEach((name, pitch) => {
      const x = xAt(pitch);
      const expected = tones.has(pitch) ? .9 : .06;
      const measured = Number.isFinite(observed[pitch]) ? observed[pitch] : 0;
      const yTarget = yAt(expected), yAudio = yAt(measured);
      targetPoints.push(`${x},${yTarget}`); audioPoints.push(`${x},${yAudio}`);
      if (tones.has(pitch)) chart.append(svgNode('rect', {
        x: x - 13, y: top, width: 26, height: bottom - top, rx: 5, class: 'comparison-chord-band',
      }));
      chart.append(svgNode('text', { x, y: 218, class: `comparison-note${tones.has(pitch) ? ' is-chord-tone' : ''}`, 'text-anchor': 'middle' }, name));
    });
    chart.append(svgNode('polyline', { points: targetPoints.join(' '), class: `comparison-target-line${chordData.recognized ? '' : ' is-unavailable'}` }));
    chart.append(svgNode('polyline', { points: audioPoints.join(' '), class: 'comparison-audio-line' }));
    PITCH_NAMES.forEach((name, pitch) => {
      const x = xAt(pitch), expected = tones.has(pitch) ? .9 : .06, measured = Number.isFinite(observed[pitch]) ? observed[pitch] : 0;
      chart.append(svgNode('circle', { cx: x, cy: yAt(expected), r: 4, class: `comparison-target-point${tones.has(pitch) ? ' is-chord-tone' : ''}` }));
      const actual = svgNode('circle', { cx: x, cy: yAt(measured), r: 4.5, class: 'comparison-audio-point' });
      actual.append(svgNode('title', {}, `${name}: audio ${Math.round(measured * 100)}% · ${tones.has(pitch) ? 'nota del acorde' : 'fuera del acorde'}`));
      chart.append(actual);
    });
    comparison.append(chart);
    if (!chordData.recognized) comparison.append(node('p', 'analysis-empty', 'El dibujo amarillo aparece al elegir o confirmar un acorde para este tramo.'));
    else comparison.append(node('p', 'analysis-comparison-score', `${tones.size} notas esperadas: ${chordData.tones.map((pitch) => PITCH_NAMES[pitch]).join(' · ')} · el perfil cian muestra lo que realmente aparece en el audio.`));
    graph.append(comparison);
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

    if (detailOnly) { restoreScroll(); return; }
    const section = getSection(segment.startMs);
    instrumentPanel.replaceChildren();
    instrumentPanel.append(node('h4', '', 'Posiciones para tocar'));
    instrumentPanel.append(node('p', 'analysis-instrument-note', segment.isSilence
      ? 'El tramo está bajo el umbral de energía; no hay notas que ubicar en el instrumento.'
      : symbol
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
    const spectralLegend = node('p', 'analysis-spectral-legend', '◆ Picos FFT dominantes · intensidad relativa · estimación, no nota confirmada');
    const renderInstrument = () => {
      drawing.replaceChildren();
      if (activeInstrument === 'guitar') {
        const peaks = spectralPeaksAt(analysis, segment, playbackPositionMs)
          .filter((peak) => Number.isFinite(peak.midi) && peak.midi >= 40 && peak.midi <= 86)
          .sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, 6);
        const manualAtCursor = (analysis.manualMidiNotes || []).filter((item) => Math.abs(item.timeMs - playbackPositionMs) <= 130)
          .map((item) => ({ ...item, note: `${PITCH_NAMES[((item.midi % 12) + 12) % 12]}${Math.floor(item.midi / 12) - 1}`,
            strength: 1, source: 'manual' }));
        renderFretboard(drawing, symbol, undefined, undefined, [...peaks, ...manualAtCursor], { interactive: true });
        spectralLegend.hidden = peaks.length === 0;
      } else {
        spectralLegend.hidden = true;
        if (activeInstrument === 'bass') renderBassFretboard(drawing, symbol);
        else if (activeInstrument === 'piano') renderPiano(drawing, symbol);
        else if (section?.tab?.trim()) renderAsciiTab(drawing, { label: section.label, ascii: section.tab });
        else drawing.append(node('p', 'analysis-empty', 'Esta sección todavía no tiene tablatura. Puedes escribirla en el editor de sección.'));
      }
    };
    [['guitar', 'Guitarra'], ['bass', 'Bajo'], ['piano', 'Piano'], ['tab', 'Tab']].forEach(([id, label]) => {
      const button = node('button', 'analysis-instrument-tab', label); button.type = 'button';
      button.setAttribute('aria-pressed', String(activeInstrument === id));
      button.addEventListener('click', () => { activeInstrument = id; renderDetail({ preserveMidiPlayback: Boolean(midiPlaybackClock) }); });
      instrumentNav.append(button);
    });
    drawing.addEventListener('click', (event) => {
      const target = event.target.closest('.fretboard-note-target');
      if (!target || activeInstrument !== 'guitar') return;
      const midi = Number(target.dataset.midi);
      if (!Number.isInteger(midi)) return;
      const timeMs = Math.max(segment.startMs, Math.min(segment.endMs - 1, Math.round(playbackPositionMs / 120) * 120));
      analysis.manualMidiNotes ||= [];
      const existing = analysis.manualMidiNotes.find((item) => item.midi === midi && Math.abs(item.timeMs - timeMs) <= 80);
      if (existing) analysis.manualMidiNotes = analysis.manualMidiNotes.filter((item) => item !== existing);
      else analysis.manualMidiNotes.push({ id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${midi}`,
        timeMs, midi, durationMs: 360, source: 'manual' });
      onChange(); renderDetail();
      if (!existing) {
        playMidiNoteAt(midi, midiRegisterFor(midi), (midiAudioContext?.currentTime || 0) + .02, .36)
          .then(() => { if (midiVoiceState?.status) midiVoiceState.status.textContent = `Agregada ${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1} · ${timeLabel(timeMs)}.`; })
          .catch((error) => { if (midiVoiceState?.status) midiVoiceState.status.textContent = error?.message || 'No se pudo reproducir la nota.'; });
      }
    });
    harmonicVisualization = createHarmonicCircle({ analysis, segment, playbackPositionMs, visibleVoices: visibleHarmonicVoices });
    harmonicHistoryHost.replaceChildren(harmonicVisualization.historyElement);
    circleWidgetHost.replaceChildren(harmonicVisualization.circleElement);
    harmonicVisualization.historyCanvas.addEventListener('click', (event) => selectAtCanvas(event, harmonicVisualization.historyCanvas, 58, 70));
    instrumentPanel.append(instrumentNav, drawing, spectralLegend, harmonicVisualization.element);
    renderInstrument();
    renderMidiVoicePanel(segment);
    refreshSpectralOverlay = () => {
      if (activeInstrument !== 'guitar') return;
      const current = getSegments().find((part) => playbackPositionMs >= part.startMs && playbackPositionMs < part.endMs) || segment;
      const peaks = spectralPeaksAt(analysis, current, playbackPositionMs)
        .filter((peak) => Number.isFinite(peak.midi) && peak.midi >= 40 && peak.midi <= 86)
        .sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, 6);
      const manualAtCursor = (analysis.manualMidiNotes || []).filter((item) => Math.abs(item.timeMs - playbackPositionMs) <= 130);
      const signature = [...peaks.map((peak) => `${Math.round(peak.midi)}:${Math.round((peak.strength || 0) * 100)}`),
        ...manualAtCursor.map((item) => `manual:${item.id}`)].join('|');
      if (signature !== lastSpectralPitchSignature) { lastSpectralPitchSignature = signature; renderInstrument(); }
    };
    restoreScroll();
  }

  mode.addEventListener('change', drawOverview);
  grouping.addEventListener('change', drawOverview);
  beatView.addEventListener('change', () => { selectedIndex = indexAt(playbackPositionMs); renderDetail(); });
  sensitivity.addEventListener('change', () => {
    if (!analysis.harmony) return;
    const at = getSegments()[selectedIndex]?.startMs ?? playbackPositionMs;
    setAnalysisSensitivity(analysis, sensitivity.value);
    selectedIndex = indexAt(at);
    onChange();
    renderDetail();
  });
  function selectAtCanvas(event, target, leftInset = 48, totalInset = 60) {
    const rect = target.getBoundingClientRect();
    const timeMs = Math.max(0, Math.min(analysis.durationMs - 1, ((event.clientX - rect.left - leftInset) / (rect.width - totalInset)) * analysis.durationMs));
    const segments = getSegments();
    const index = segments.findIndex((segment) => timeMs >= segment.startMs && timeMs < segment.endMs);
    if (index >= 0) { selectedIndex = index; playbackPositionMs = segments[index].startMs; renderDetail(); onSelect(segments[index]); }
  }
  canvas.addEventListener('click', (event) => selectAtCanvas(event, canvas));
  waveformCanvas.addEventListener('click', (event) => selectAtCanvas(event, waveformCanvas));
  applyPanelState();
  renderDetail();
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { drawOverview(); midiVoiceState?.draw?.(); }) : null;
  resizeObserver?.observe(root);
  requestAnimationFrame(() => { drawOverview(); midiVoiceState?.draw?.(); });
  function setPlaybackPosition(positionMs, { followSelection = true } = {}) {
    playbackPositionMs = Number.isFinite(positionMs) ? positionMs : 0;
    const segments = getSegments();
    const index = segments.findIndex((segment) => playbackPositionMs >= segment.startMs && playbackPositionMs < segment.endMs);
    midiVoiceState?.setPlayhead?.(segments[index] || segments[selectedIndex], playbackPositionMs);
    if (followSelection && index >= 0 && index !== selectedIndex) {
      selectedIndex = index;
      renderDetail({ preserveMidiPlayback: Boolean(midiPlaybackClock), preserveScroll: true, detailOnly: true });
      updateSelectionButtons();
    }
    const activeSegment = segments[index] || segments[selectedIndex];
    harmonicVisualization?.update(activeSegment, playbackPositionMs, liveFrame);
    midiVoiceState?.setPlayhead?.(activeSegment, playbackPositionMs);
    refreshSpectralOverlay();
    drawOverview(); midiVoiceState?.draw?.();
  }

  function setLiveFrame(frame) {
    liveFrame = frame;
    const segments = getSegments();
    const index = segments.findIndex((segment) => playbackPositionMs >= segment.startMs && playbackPositionMs < segment.endMs);
    harmonicVisualization?.update(segments[index] || segments[selectedIndex], playbackPositionMs, liveFrame);
    drawOverview();
  }
  function selectSegmentAt(positionMs) {
    const segments = getSegments();
    const index = segments.findIndex((segment) => positionMs >= segment.startMs && positionMs < segment.endMs);
    if (index >= 0) {
      selectedIndex = index;
      if (!midiPlaybackClock) playbackPositionMs = segments[index].startMs;
      renderDetail({ preserveMidiPlayback: Boolean(midiPlaybackClock) });
    }
  }

  function moveSelection(delta) {
    const segments = getSegments();
    if (!segments.length) return false;
    const nextIndex = Math.max(0, Math.min(segments.length - 1, selectedIndex + Math.sign(delta)));
    if (nextIndex === selectedIndex) return false;
    selectedIndex = nextIndex;
    const segment = segments[nextIndex];
    if (midiPlaybackClock) updateSelectionButtons();
    else {
      playbackPositionMs = segment.startMs;
      renderDetail();
    }
    return true;
  }

  function updateSelectionButtons() {
    [...list.children].forEach((button, index) => button.setAttribute('aria-current', String(index === selectedIndex)));
    const selectedButton = list.children[selectedIndex];
    if (selectedButton) {
      const listRect = list.getBoundingClientRect(), buttonRect = selectedButton.getBoundingClientRect();
      if (buttonRect.top < listRect.top) list.scrollTop -= listRect.top - buttonRect.top;
      else if (buttonRect.bottom > listRect.bottom) list.scrollTop += buttonRect.bottom - listRect.bottom;
    }
  }
  function setAuditionStatus(message) {
    auditionStatus = message;
    const status = detail.querySelector('.analysis-listen-status');
    if (status) status.textContent = message;
  }

  return { element: root, waveformCanvas, historyElement: harmonicHistoryHost, redraw: drawOverview, refreshPanels: applyPanelState, getSelectedSegments: getSegments, focusChordSelect: () => activeChordSelect?.focus(),
    setPlaybackPosition, setLiveFrame, setAuditionStatus, selectSegmentAt, moveSelection, refreshDetail: renderDetail,
    dispose: () => {
      stopMidiPlayback(); resizeObserver?.disconnect(); harmonicVisualization?.dispose();
      harmonicHistoryHost.replaceChildren(); circleWidgetHost.replaceChildren();
      // Each re-analysis builds a new visualizer; without this its AudioContext leaked.
      midiAudioContext?.close().catch(() => {});
      midiAudioContext = null; midiMasterGain = null; midiCompressor = null; midiEqFilters = null;
    },
    getSelectedSegment: () => getSegments()[selectedIndex] || null };
}
