/**
 * Minimal reusable modal for the v2 import/migration flow (collision choice,
 * legacy grid-rule prompt, result/info messages). Deliberately plain — the
 * real prompter/editor UI overhaul is a later checkpoint; this only needs to
 * make C1's storage/validation behavior observable and safe to use.
 * Every piece of untrusted data (song titles, artists, ids) is written via
 * textContent, never innerHTML/template interpolation into markup.
 */

function modalEl() { return document.getElementById('import-modal'); }
function bodyEl() { return document.getElementById('import-modal-body'); }
function actionsEl() { return document.getElementById('import-modal-actions'); }

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function openModal() { modalEl().style.display = 'flex'; }
function closeModal() { modalEl().style.display = 'none'; }

function appendHeading(container, text) {
  const h = document.createElement('h3');
  h.textContent = text;
  container.appendChild(h);
}

function appendLines(container, lines) {
  lines.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    container.appendChild(p);
  });
}

function appendButtons(container, buttons, resolve) {
  buttons.forEach((btn) => {
    const el = document.createElement('button');
    el.textContent = btn.label;
    el.className = btn.primary ? 'btn-primary' : 'btn-secondary';
    el.style.marginLeft = '8px';
    el.onclick = () => { closeModal(); resolve(btn.value); };
    container.appendChild(el);
  });
}

/** @returns {Promise<string>} resolves with the clicked button's `value` */
function showDialog({ heading, lines = [], buttons }) {
  return new Promise((resolve) => {
    const body = bodyEl();
    clearChildren(body);
    appendHeading(body, heading);
    appendLines(body, lines);

    const actions = actionsEl();
    clearChildren(actions);
    appendButtons(actions, buttons, resolve);
    openModal();
  });
}

/** @returns {Promise<'replace'|'duplicate'|'cancel'>} */
export function askCollision(existing, incoming) {
  return showDialog({
    heading: 'Ya existe una canción con ese ID',
    lines: [
      `Existente: "${existing.metadata.title}" — ${existing.metadata.artist || 'artista desconocido'}`,
      `Nueva: "${incoming.metadata.title}" — ${incoming.metadata.artist || 'artista desconocido'}`,
      `ID en conflicto: ${incoming.id}`,
    ],
    buttons: [
      { label: 'Reemplazar', value: 'replace' },
      { label: 'Duplicar (ID nuevo)', value: 'duplicate' },
      { label: 'Cancelar', value: 'cancel', primary: true },
    ],
  });
}

/** @returns {Promise<number|null>} null si cancela */
export function promptBarsPerLine(legacyTitle) {
  return new Promise((resolve) => {
    const body = bodyEl();
    clearChildren(body);
    appendHeading(body, `Migrar "${legacyTitle}" a formato v2 (opcional)`);
    appendLines(body, [
      'Este archivo legacy no tiene tiempos reales en milisegundos.',
      'Elegí una regla provisional: cuántos compases dura cada línea. Queda marcada como temporización "Estimada"; se corrige después escuchando la pista real.',
    ]);

    const label = document.createElement('label');
    label.textContent = 'Compases por línea: ';
    label.style.display = 'block';
    label.style.marginTop = '10px';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '16';
    input.value = '2';
    input.className = 'form-input';
    input.style.width = '80px';
    input.style.display = 'inline-block';
    label.appendChild(input);
    body.appendChild(label);

    const actions = actionsEl();
    clearChildren(actions);
    appendButtons(actions, [
      { label: 'No migrar ahora', value: 'skip' },
      { label: 'Migrar a v2', value: 'go', primary: true },
    ], (value) => {
      if (value === 'skip') { resolve(null); return; }
      const n = parseInt(input.value, 10);
      resolve(Number.isInteger(n) && n > 0 ? n : 2);
    });
    openModal();
  });
}

/** @returns {Promise<void>} */
export function showInfo(heading, lines = []) {
  return showDialog({ heading, lines, buttons: [{ label: 'Cerrar', value: 'ok', primary: true }] }).then(() => undefined);
}
