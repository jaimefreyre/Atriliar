/**
 * Public transposition API kept at its historical path/names (songRenderer.js
 * imports these). Delegates entirely to harmony.js — this file adds nothing
 * of its own so there is only one parser/interval table in the project.
 */
export { transposeChordSymbol as transposeChord, transposeKey } from './harmony.js';
