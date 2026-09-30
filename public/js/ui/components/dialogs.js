let dialogElement;
let toastRegion;

function ensureDialog() {
  if (dialogElement?.isConnected) return dialogElement;
  dialogElement = document.createElement('dialog');
  dialogElement.className = 'sp-dialog';
  dialogElement.setAttribute('aria-labelledby', 'sp-dialog-title');
  dialogElement.innerHTML = '<form method="dialog"><div class="sp-dialog__body"><h2 id="sp-dialog-title"></h2><div class="sp-dialog__message"></div></div><div class="sp-dialog__actions"></div></form>';
  dialogElement.addEventListener('click', (event) => {
    if (event.target === dialogElement) dialogElement.close('cancel');
  });
  document.body.append(dialogElement);
  return dialogElement;
}

export function showDialog({ title = 'StagePrompter', message = '', confirm = false, confirmLabel = 'Continuar' } = {}) {
  const dialog = ensureDialog();
  const heading = dialog.querySelector('#sp-dialog-title');
  const body = dialog.querySelector('.sp-dialog__message');
  const actions = dialog.querySelector('.sp-dialog__actions');
  heading.textContent = title;
  body.replaceChildren();
  if (Array.isArray(message)) {
    const list = document.createElement('ul');
    for (const line of message) {
      const item = document.createElement('li');
      item.textContent = line;
      list.append(item);
    }
    body.append(list);
  } else {
    body.textContent = String(message);
  }
  actions.replaceChildren();
  const cancel = document.createElement('button');
  cancel.type = 'submit';
  cancel.value = 'cancel';
  cancel.className = 'sp-btn';
  cancel.textContent = confirm ? 'Cancelar' : 'Cerrar';
  actions.append(cancel);
  if (confirm) {
    const accept = document.createElement('button');
    accept.type = 'submit';
    accept.value = 'confirm';
    accept.className = 'sp-btn sp-btn--primary';
    accept.textContent = confirmLabel;
    actions.append(accept);
  }
  return new Promise((resolve) => {
    const finish = () => {
      dialog.removeEventListener('close', finish);
      resolve(dialog.returnValue === 'confirm');
    };
    dialog.addEventListener('close', finish, { once: true });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (confirm ? actions.lastElementChild : cancel).focus();
  });
}

export async function showAlert(title, message) {
  await showDialog({ title, message });
}

export async function showConfirm(title, message, confirmLabel = 'Eliminar') {
  return showDialog({ title, message, confirm: true, confirmLabel });
}

export function showToast(message, { kind = 'info', duration = 4200 } = {}) {
  if (!toastRegion?.isConnected) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'sp-toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-relevant', 'additions text');
    document.body.append(toastRegion);
  }
  const toast = document.createElement('div');
  toast.className = `sp-toast sp-toast--${kind}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), duration);
}
