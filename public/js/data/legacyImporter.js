/**
 * Converts a legacy v1 document ({metadata, structure[], references}) into a
 * v2 SongDocument using one explicit, user-chosen grid rule ("N compases por
 * línea"), per docs/spec-v2/contratos/CONTRATO-DATOS.md "Migración del
 * formato existente". Pure function: no DB access, no silent time inference
 * from character distance, no auto-generated tab ASCII. The caller is
 * responsible for persisting the result (see importSongV2.js), which is what
 * makes re-running a migration idempotent: it goes through the same
 * replace/duplicate/cancel collision flow as any other v2 import.
 */

import { validateSongV2 } from './songValidator.js';
import { extractSlashBass } from '../music/notes.js';

const SECTION_TYPE_MAP = {
  intro: 'intro',
  verse: 'verse',
  prechorus: 'prechorus',
  'pre-chorus': 'prechorus',
  chorus: 'chorus',
  bridge: 'bridge',
  solo: 'solo',
  instrumental: 'instrumental',
  outro: 'outro',
};

const KEY_RE = /^[A-G](?:#|b)?m?$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_BARS_PER_LINE = 2;

function mapSectionType(rawType) {
  if (typeof rawType !== 'string') return 'other';
  return SECTION_TYPE_MAP[rawType.trim().toLowerCase()] || 'other';
}

function normalizeKey(rawKey) {
  if (typeof rawKey !== 'string') return null;
  const trimmed = rawKey.trim();
  return KEY_RE.test(trimmed) ? trimmed : null;
}

function parseLegacyTimeSignature(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const numerator = parseInt(m[1], 10);
  const denominator = parseInt(m[2], 10);
  if (![1, 2, 4, 8, 16, 32].includes(denominator)) return null;
  if (numerator < 1 || numerator > 32) return null;
  return { numerator, denominator };
}

function safeId(candidate, fallback) {
  return typeof candidate === 'string' && ID_RE.test(candidate) ? candidate : fallback;
}

/**
 * @param {object} legacy documento v1 con 'structure' (ver public/fixtures o los 5 JSON legacy en la raíz)
 * @param {{barsPerLine?: number, bpmOverride?: number, timeSignatureOverride?: {numerator:number,denominator:number}}} [options]
 * @returns {{document: object, warnings: string[], report: object}}
 * @throws {Error} si falta un dato imprescindible (bpm/compás) sin override, o si el resultado no pasa validateSongV2
 */
export function migrateLegacySong(legacy, options = {}) {
  const warnings = [];
  const report = { droppedAnchors: [], unconvertedTabs: [], sectionTypeFallbacks: [], droppedEmptyChords: [] };

  const barsPerLine = Number.isInteger(options.barsPerLine) && options.barsPerLine > 0
    ? options.barsPerLine
    : DEFAULT_BARS_PER_LINE;

  const bpm = Number.isFinite(legacy?.metadata?.bpm) && legacy.metadata.bpm > 0
    ? legacy.metadata.bpm
    : options.bpmOverride;
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error(`BPM legacy inválido ("${legacy?.metadata?.bpm}") y no se proveyó bpmOverride`);
  }

  const timeSignature = parseLegacyTimeSignature(legacy?.metadata?.timeSignature) || options.timeSignatureOverride;
  if (!timeSignature) {
    throw new Error(`Compás legacy inválido ("${legacy?.metadata?.timeSignature}") y no se proveyó timeSignatureOverride`);
  }

  const quarterMs = 60000 / bpm;
  const meterUnitMs = (quarterMs * 4) / timeSignature.denominator;
  const barMs = meterUnitMs * timeSignature.numerator;
  const boundaryMs = (bars) => Math.round(bars * barMs);

  const structure = Array.isArray(legacy.structure) ? legacy.structure : [];
  const topKey = normalizeKey(legacy?.metadata?.originalKey);

  const sections = [];
  const lines = [];
  const chords = [];
  let cumulativeBars = 0;
  let lineCounter = 0;
  let sectionCounter = 0;

  structure.forEach((legacySection) => {
    sectionCounter += 1;
    const sectionId = `section-${String(sectionCounter).padStart(3, '0')}`;
    const sectionStartBars = cumulativeBars;
    const legacyLines = Array.isArray(legacySection.lines) ? legacySection.lines : [];
    // Una sección sin líneas igual necesita ocupar tiempo real (no puede durar 0 ms).
    const linesForSection = legacyLines.length > 0 ? legacyLines : [null];

    linesForSection.forEach((legacyLine) => {
      const lineStartBars = cumulativeBars;
      cumulativeBars += barsPerLine;
      if (!legacyLine) return; // placeholder de duración, sin línea real

      const text = typeof legacyLine.lyrics === 'string' ? legacyLine.lyrics : '';
      if (text.length === 0) return; // v2 no admite texto vacío; queda como hueco instrumental

      lineCounter += 1;
      const lineId = `line-${String(lineCounter).padStart(3, '0')}`;
      const lineStartMs = boundaryMs(lineStartBars);
      const lineEndMs = boundaryMs(cumulativeBars);
      lines.push({ id: lineId, sectionId, startMs: lineStartMs, endMs: lineEndMs, text, tokens: [] });

      const legacyChords = Array.isArray(legacyLine.chords) ? legacyLine.chords : [];
      const sortedChords = [...legacyChords].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const n = sortedChords.length;
      sortedChords.forEach((legacyChord, idx) => {
        const symbol = String(legacyChord?.chord ?? '').trim();
        if (!symbol) {
          report.droppedEmptyChords.push({ lineId, position: legacyChord?.position });
          warnings.push(`Acorde vacío en línea "${lineId}" (posición legacy ${legacyChord?.position}); se omitió.`);
          return;
        }
        // Repartir en partes iguales POR CANTIDAD dentro de la línea: la única regla
        // provisional que el contrato permite (nunca por distancia de caracteres).
        const chordStartMs = lineStartMs + Math.round((idx * (lineEndMs - lineStartMs)) / n);
        const chordEndMs = lineStartMs + Math.round(((idx + 1) * (lineEndMs - lineStartMs)) / n);
        if (chordStartMs >= chordEndMs) {
          warnings.push(`Acorde "${symbol}" en línea "${lineId}" se omitió: la rejilla de ${barsPerLine} compás(es) por línea es demasiado fina para ${n} acordes en esa línea.`);
          return;
        }
        const position = typeof legacyChord.position === 'number' ? legacyChord.position : -1;
        let anchor = null;
        if (position >= 0 && position < text.length) {
          anchor = { lineId, charOffset: position };
        } else {
          report.droppedAnchors.push({ lineId, symbol, position, textLength: text.length });
          warnings.push(`Acorde "${symbol}" en línea "${lineId}": posición legacy ${position} fuera de rango (longitud ${text.length}); se guardó sin ancla visual en vez de truncarla.`);
        }
        chords.push({
          id: `chord-${String(chords.length + 1).padStart(3, '0')}`,
          startMs: chordStartMs,
          endMs: chordEndMs,
          symbol,
          bassNote: extractSlashBass(symbol),
          anchor,
          scale: null,
        });
      });

      if (Array.isArray(legacyLine.tab) && legacyLine.tab.length > 0) {
        report.unconvertedTabs.push({ lineId, notes: legacyLine.tab });
        warnings.push(`Línea "${lineId}" tenía tablatura legacy nota-a-nota; no se convierte automáticamente a ASCII (hay que confirmar la convención de cuerdas primero). Ver el informe de migración.`);
      }
    });

    const sectionEndBars = cumulativeBars;
    const sectionKeyRaw = normalizeKey(legacySection.key);
    const sectionType = mapSectionType(legacySection.type);
    if (sectionType === 'other' && legacySection.type) {
      report.sectionTypeFallbacks.push({ sectionId, originalType: legacySection.type });
    }
    sections.push({
      id: sectionId,
      type: sectionType,
      label: String(legacySection.label || legacySection.type || sectionId).slice(0, 80),
      key: sectionKeyRaw !== topKey ? sectionKeyRaw : null,
      startMs: boundaryMs(sectionStartBars),
      endMs: boundaryMs(sectionEndBars),
    });
  });

  const durationMs = boundaryMs(cumulativeBars);
  if (!(durationMs > 0)) {
    throw new Error('La canción legacy no tiene secciones/líneas suficientes para derivar una duración positiva');
  }

  const sources = [];
  const refs = legacy.references || {};
  for (const refKey of ['youtube_studio', 'youtube_live', 'youtube_tutorial']) {
    const url = typeof refs[refKey] === 'string' ? refs[refKey].trim() : '';
    if (url) sources.push({ url, title: '', retrievedAt: null });
  }
  if (sources.length > 0) {
    warnings.push('Referencias migradas desde YouTube sin verificar; confirmar antes de mostrarlas como consultadas.');
  }

  const document = {
    schemaVersion: 2,
    id: safeId(legacy.id, `legacy-${Date.now()}`),
    metadata: {
      title: String(legacy?.metadata?.title || 'Sin título').slice(0, 200),
      artist: String(legacy?.metadata?.artist || '').slice(0, 200),
      key: topKey,
      bpm,
      timeSignature,
    },
    durationMs,
    timing: {
      status: 'estimated',
      method: 'grid',
      notes: `Migrado desde formato legacy v1: ${barsPerLine} compás(es) por línea a ${bpm} negras/minuto en ${timeSignature.numerator}/${timeSignature.denominator}. Acordes repartidos en partes iguales dentro de cada línea por cantidad, no por distancia de caracteres; revisar escuchando la pista real antes de declarar revisión.`,
    },
    audio: null,
    sections,
    lines,
    chords,
    tabs: [],
    sources,
    reviewWarnings: Array.from(new Set([
      'Temporización estimada por cuadrícula asistida; revisar escuchando antes de usar en vivo.',
      ...warnings,
    ])),
  };

  const check = validateSongV2(document);
  if (!check.valid) {
    throw new Error('El documento migrado no pasó su propia validación v2: ' + JSON.stringify(check.errors));
  }

  return { document, warnings, report };
}
