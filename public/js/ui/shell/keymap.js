const MODE_BY_KEY = { '1': 'autopsia', '2': 'cifrado', '3': 'loopera', '4': 'karaoke', '5': 'atril' };

export function installKeymap(onMode, onLibrary) {
  const handler = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape') { onLibrary(); return; }
    if (MODE_BY_KEY[event.key]) onMode(MODE_BY_KEY[event.key]);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
