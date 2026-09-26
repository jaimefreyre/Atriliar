const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };

export function normalizeNote(note) {
  if (!note) return null;
  const upper = note.toUpperCase();
  return FLAT_TO_SHARP[upper] || upper;
}

export function parseChord(chordStr) {
  if (!chordStr) return null;
  const normalized = chordStr.trim().replace(/\s+/g, '');
  
  // Regex para: Root + Quality + (tensions) + /extension + /bass
  // Ejemplos: Amaj7/9/E, G7(b5), C#m7(b5), F#7M, D/F#, Bbmaj7
  const regex = /^([A-G][#b]?)(maj7|7M|M7|m7|m6|m7b5|7sus4|sus4|sus2|add9|add11|7|m|dim|dim7|aug|5|6|9|11|13|)(?:\(([^)]+)\))?(?:\/([0-9]+[b#]?))?(?:\/([A-G][#b]?))?$/i;
  const match = normalized.match(regex);
  
  if (!match) {
    // Fallback: solo root + resto como calidad
    const fallback = normalized.match(/^([A-G][#b]?)(.*)$/i);
    if (fallback) {
      return { 
        valid: true, 
        original: chordStr, 
        root: normalizeNote(fallback[1]), 
        quality: fallback[2] || '', 
        extensions: [], 
        alterations: [], 
        bass: null 
      };
    }
    return { valid: false, original: chordStr };
  }

  let [, root, quality, tensions, ext, bass] = match;
  root = normalizeNote(root);
  
  // Normalizar aliases
  if (quality === 'M7' || quality === 'maj7') quality = '7M';
  if (quality === 'm7b5') quality = 'm7'; // lo manejamos como alteración
  
  const extensions = [];
  const alterations = [];
  
  if (tensions) {
    tensions.split(',').forEach(t => {
      t = t.trim().toLowerCase();
      if (t.includes('b') || t.includes('#')) alterations.push(t);
      else extensions.push(t);
    });
  }
  
  // Extensión suelta entre root y bass: Amaj7/9/E -> extension "9"
  if (ext) {
    if (ext.includes('b') || ext.includes('#')) alterations.push(ext);
    else extensions.push(ext);
  }
  
  return {
    valid: true,
    original: chordStr,
    root,
    quality,
    extensions,
    alterations,
    bass: normalizeNote(bass)
  };
}