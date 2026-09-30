const frame = document.getElementById('app-under-test');
const results = document.getElementById('results');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (predicate()) return; } catch { /* frame todavía cargando */ }
    await wait(100);
  }
  throw new Error(`Tiempo agotado: ${label}`);
}

function report(label, error = null) {
  const row = document.createElement('li');
  row.dataset.result = error ? 'fail' : 'pass';
  row.textContent = `${error ? '✕' : '✓'} ${label}${error ? ` — ${error.message || error}` : ''}`;
  results.append(row);
  if (error) throw error;
}

function makeWav() {
  const rate = 44100; const count = rate; const bytes = new ArrayBuffer(44 + count * 2); const view = new DataView(bytes);
  const write = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 12000), true);
  return new File([bytes], 'sp-test-tone.wav', { type: 'audio/wav' });
}

function removeTestRecords(songId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StagePrompterDB');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const stores = ['songsV2', 'projects', 'analyses'].filter((name) => db.objectStoreNames.contains(name));
      if (!stores.length) { db.close(); resolve(); return; }
      const tx = db.transaction(stores, 'readwrite');
      if (stores.includes('songsV2')) tx.objectStore('songsV2').delete(songId);
      if (stores.includes('projects')) tx.objectStore('projects').delete(songId);
      if (stores.includes('analyses')) {
        const index = tx.objectStore('analyses').index('songId');
        const cursor = index.openCursor(IDBKeyRange.only(songId));
        cursor.onsuccess = () => { const row = cursor.result; if (row) { row.delete(); row.continue(); } };
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

async function run() {
  results.replaceChildren();
  const progress = Object.assign(document.createElement('li'), { textContent: 'Iniciando shell E2b…' });
  results.append(progress);
  let testSongId = null;
  try {
  frame.src = '../../index.html?e2e=1#/';
  await until(() => frame.contentDocument?.querySelector('.sp-library__intro'), 'carga del shell');
  report('El localhost de prueba abre el shell E2b en la portada.');

  let doc = frame.contentDocument;
  const buttons = [...doc.querySelectorAll('.sp-library__actions button, .sp-library__actions label')].map((item) => item.textContent.trim());
  if (!buttons.some((name) => name.includes('Nueva desde audio')) || !buttons.some((name) => name.includes('Importar'))) throw new Error('Faltan acciones de biblioteca.');
  report('Biblioteca muestra crear desde audio, canción vacía, importar y exportar.');

  const search = doc.querySelector('input[type="search"]');
  search.value = 'sin-coincidencia-e2b'; search.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
  await until(() => doc.querySelector('.sp-empty-state')?.textContent.includes('No hay coincidencias'), 'filtro de biblioteca');
  report('La búsqueda filtra resultados sin desordenar la biblioteca.');

  doc.querySelector('.sp-library__actions .sp-btn--primary').click();
  await until(() => frame.contentWindow.location.hash.includes('/cancion/new/autopsia'), 'ruta nueva desde audio');
  await until(() => doc.querySelector('.sp-legacy-frame')?.contentDocument?.getElementById('audio-draft-file'), 'host legacy montado');
  const legacyFrame = doc.querySelector('.sp-legacy-frame');
  report('Nueva desde audio navega con ruta y monta el laboratorio legado bajo demanda.');
  if (doc.querySelectorAll('.sp-modes a[data-mode]').length !== 6) throw new Error('La navegación no expone los seis modos del proyecto.');
  report('El proyecto muestra rutas para Autopsia, Cifrado, Loopera, Karaoke, Multipista y Atril.');

  const input = legacyFrame.contentDocument.getElementById('audio-draft-file');
  const transfer = new legacyFrame.contentWindow.DataTransfer(); transfer.items.add(makeWav()); input.files = transfer.files;
  input.dispatchEvent(new legacyFrame.contentWindow.Event('change', { bubbles: true }));
  await until(() => legacyFrame.contentDocument.querySelector('.audio-study-player audio'), 'carga de audio sintético', 12000);
  report('La herramienta legado recibe y muestra el archivo de prueba por la entrada de audio.');

  frame.contentWindow.document.activeElement.blur();
  frame.contentWindow.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: '4', bubbles: true }));
  await until(() => frame.contentWindow.location.hash.includes('/cancion/new/karaoke'), 'atajo de teclado');
  await until(() => doc.querySelector('.sp-legacy-frame')?.contentDocument?.querySelector('#audio-draft-assistant .lab-workspace-tab[aria-pressed="true"]')?.textContent.includes('Karaoke'), 'navegación a karaoke');
  report('El atajo 4 conserva el audio activo y cambia el panel a Karaoke.');

  frame.contentWindow.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => frame.contentWindow.location.hash === '#/', 'volver a biblioteca');
  await until(() => !doc.querySelector('.sp-legacy-frame'), 'desmontar vista legado');
  report('Escape vuelve a la biblioteca y desmonta el host legado.');

  search.value = ''; search.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
  const fixtureResponse = await fetch('./song-v2.json');
  if (!fixtureResponse.ok) throw new Error('No se pudo leer el fixture v2 local de prueba.');
  const testSong = await fixtureResponse.json();
  testSongId = `sp-test-e2b-${Date.now()}`;
  testSong.id = testSongId; testSong.metadata.title = 'sp-test-e2b';
  const importInput = doc.querySelector('.sp-library-host input[type="file"]');
  const importTransfer = new frame.contentWindow.DataTransfer();
  importTransfer.items.add(new frame.contentWindow.File([JSON.stringify(testSong)], `${testSongId}.json`, { type: 'application/json' }));
  importInput.files = importTransfer.files;
  importInput.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
  await until(() => doc.querySelector(`[data-song-id="${testSongId}"]`), 'importación v2 de prueba');
  report('El importador acepta un SongDocument v2 y lo agrega a la biblioteca.');

  const card = doc.querySelector(`[data-song-id="${testSongId}"]`);
  card.querySelector('.sp-library-card__actions .sp-btn--primary').click();
  await until(() => frame.contentWindow.location.hash.includes(`/cancion/${testSongId}/autopsia`), 'ruta de canción importada');
  await until(() => doc.querySelector('.sp-legacy-frame')?.contentDocument?.getElementById('audio-draft-file'), 'herramienta de canción importada');
  report('La ruta de una canción guardada abre su laboratorio desde el shell.');

  frame.contentWindow.location.reload();
  await until(() => frame.contentWindow.location.hash.includes(`/cancion/${testSongId}/autopsia`)
    && frame.contentDocument?.querySelector('.sp-legacy-frame'), 'recarga de ruta persistente');
  doc = frame.contentDocument;
  report('Al recargar, conserva la canción y el modo de trabajo seleccionado.');

  frame.contentWindow.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => frame.contentWindow.location.hash === '#/', 'retorno desde canción');
  const testCard = `[data-song-id="${testSongId}"]`;
  await until(() => frame.contentDocument?.querySelector(testCard), 'reapertura de la tarjeta de prueba');
  frame.contentDocument.querySelector(`${testCard} .sp-library-card__actions .sp-btn--danger`).click();
  await until(() => frame.contentDocument?.querySelector('dialog[open]'), 'confirmación nativa de eliminación');
  frame.contentDocument.querySelector('dialog[open] button[value="confirm"]').click();
  await until(() => !frame.contentDocument?.querySelector(testCard), 'borrado del registro de prueba');
  report('El diálogo nativo confirma la eliminación de la canción temporal.');
  } finally {
    if (testSongId) await removeTestRecords(testSongId).catch(() => {});
    progress.remove();
  }
}

document.getElementById('run-suite').addEventListener('click', () => run().catch((error) => {
  const row = document.createElement('li'); row.dataset.result = 'fail'; row.textContent = `✕ ${error.message || error}`; results.append(row);
}));
