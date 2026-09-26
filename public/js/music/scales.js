import { noteToPitchClass, pitchClassToSharpName } from './notes.js';

export const SCALES = {
  'ionian': { name: 'Jónica / Mayor', intervals: [0,2,4,5,7,9,11], category: 'Modos' },
  'dorian': { name: 'Dórica', intervals: [0,2,3,5,7,9,10], category: 'Modos' },
  'phrygian': { name: 'Frigia', intervals: [0,1,3,5,7,8,10], category: 'Modos' },
  'lydian': { name: 'Lidia', intervals: [0,2,4,6,7,9,11], category: 'Modos' },
  'mixolydian': { name: 'Mixolidia', intervals: [0,2,4,5,7,9,10], category: 'Modos' },
  'aeolian': { name: 'Eólica / Menor natural', intervals: [0,2,3,5,7,8,10], category: 'Modos' },
  'locrian': { name: 'Locria', intervals: [0,1,3,5,6,8,10], category: 'Modos' },
  'major-pentatonic': { name: 'Pentatónica Mayor', intervals: [0,2,4,7,9], category: 'Pentatónicas' },
  'minor-pentatonic': { name: 'Pentatónica Menor', intervals: [0,3,5,7,10], category: 'Pentatónicas' },
  'major-blues': { name: 'Blues Mayor', intervals: [0,2,3,4,7,9], category: 'Blues' },
  'minor-blues': { name: 'Blues Menor', intervals: [0,3,5,6,7,10], category: 'Blues' },
  'dominant-bebop': { name: 'Bebop Dominante', intervals: [0,2,4,5,7,9,10,11], category: 'Bebop' },
  'major-bebop': { name: 'Bebop Mayor', intervals: [0,2,4,5,7,8,9,11], category: 'Bebop' },
  'minor-bebop': { name: 'Bebop Menor', intervals: [0,2,3,4,5,7,9,10], category: 'Bebop' },
  'harmonic-minor': { name: 'Menor Armónica', intervals: [0,2,3,5,7,8,11], category: 'Menores' },
  'melodic-minor': { name: 'Menor Melódica', intervals: [0,2,3,5,7,9,11], category: 'Menores' },
  'phrygian-dominant': { name: 'Frigia Dominante', intervals: [0,1,4,5,7,8,10], category: 'Exóticas' },
  'double-harmonic-major': { name: 'Doble Armónica Mayor', intervals: [0,1,4,5,7,8,11], category: 'Exóticas' },
  'hungarian-minor': { name: 'Menor Húngara', intervals: [0,2,3,6,7,8,11], category: 'Exóticas' },
  'hirajoshi': { name: 'Hirajoshi', intervals: [0,2,3,7,8], category: 'Japonesas' },
  'kumoi': { name: 'Kumoi', intervals: [0,2,3,7,9], category: 'Japonesas' },
  'kumoijoshi': { name: 'Kumoijoshi', intervals: [0,1,5,7,8], category: 'Japonesas' },
  'iwato': { name: 'Iwato', intervals: [0,1,5,6,10], category: 'Japonesas' },
  'whole-tone': { name: 'Tonos Enteros', intervals: [0,2,4,6,8,10], category: 'Simétricas' },
  'diminished-half-whole': { name: 'Disminuida S-T', intervals: [0,1,3,4,6,7,9,10], category: 'Simétricas' },
  'diminished-whole-half': { name: 'Disminuida T-S', intervals: [0,2,3,5,6,8,9,11], category: 'Simétricas' },
  'augmented': { name: 'Aumentada', intervals: [0,3,4,7,8,11], category: 'Simétricas' }
};

export const SCALE_CATEGORIES = ['Modos', 'Pentatónicas', 'Blues', 'Bebop', 'Menores', 'Exóticas', 'Japonesas', 'Simétricas'];

/** Acepta raíz en sostenidos o bemoles (equivalencia enarmónica vía notes.js). */
export function getScaleNotes(rootNote, scaleId) {
  const scale = SCALES[scaleId];
  if (!scale) return [];
  const rootPc = noteToPitchClass(rootNote);
  if (rootPc === null) return [];
  return scale.intervals.map(i => pitchClassToSharpName(rootPc + i));
}

export function getScaleById(id) {
  return SCALES[id] || null;
}