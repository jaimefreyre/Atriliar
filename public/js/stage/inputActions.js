/**
 * Keyboard/pedal -> semantic action layer (REQ-10), decoupled from which
 * physical key fires which action — a pedal is just a keyboard to the OS,
 * so keyboard and pedal share this one listener and its two safety guards:
 * ignore key events while an input/select/textarea/contenteditable has
 * focus, and ignore event.repeat (a held key/pedal must not spam advances).
 * Built once here so stage mode (C6) doesn't reimplement either guard.
 */

export const ACTIONS = Object.freeze({
  TOGGLE_PLAY: 'toggle-play',
  NEXT_BLOCK: 'next-block',
  PREV_BLOCK: 'prev-block',
  EXIT_STAGE: 'exit-stage',
});

const DEFAULT_BINDINGS = {
  ' ': ACTIONS.TOGGLE_PLAY,
  'Spacebar': ACTIONS.TOGGLE_PLAY, // event.key legacy en navegadores viejos
  'ArrowRight': ACTIONS.NEXT_BLOCK,
  'ArrowLeft': ACTIONS.PREV_BLOCK,
  'Escape': ACTIONS.EXIT_STAGE,
};

const EDITABLE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

function isEditingContext(target) {
  if (!target) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * @param {Object} options
 * @param {Record<string,string>} [options.bindings] event.key -> action id; sobreescribible para mapear un pedal con otras teclas.
 * @param {(action: string, event: KeyboardEvent) => void} options.onAction
 * @param {EventTarget} [options.target]
 * @returns {{dispose: () => void}}
 */
export function createInputActionListener({ bindings = DEFAULT_BINDINGS, onAction, target = window } = {}) {
  function handleKeydown(event) {
    if (isEditingContext(event.target)) return;
    const action = bindings[event.key];
    if (!action) return;
    if (event.repeat) return; // tecla/pedal mantenido no genera saltos múltiples
    event.preventDefault();
    onAction(action, event);
  }

  target.addEventListener('keydown', handleKeydown);
  return {
    dispose() {
      target.removeEventListener('keydown', handleKeydown);
    },
  };
}
