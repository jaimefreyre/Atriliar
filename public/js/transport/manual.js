/**
 * Manual mode: no audio, no clock advancement. `rate: 0` makes the shared
 * transport's positionMs() formula (anchorSongMs + elapsed*rate) always
 * collapse to anchorSongMs — position changes only via an explicit seek(),
 * which is exactly what "pedal/keyboard selects the next block" means
 * (see stage/inputActions.js and timeline/selectors.js's getBlocks()).
 */
export function createManualAdapter() {
  return {
    now: () => performance.now(),
    rate: 0,
  };
}
