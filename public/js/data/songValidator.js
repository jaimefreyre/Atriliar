export function validateSong(song) {
  const errors = [];
  if (!song.id) errors.push("Falta 'id'");
  if (!song.metadata?.title) errors.push("Falta 'metadata.title'");
  if (!song.metadata?.bpm || song.metadata.bpm <= 0) errors.push("BPM inválido");
  if (!Array.isArray(song.structure)) errors.push("'structure' debe ser un array");
  else {
    song.structure.forEach((section, sIdx) => {
      if (!Array.isArray(section.lines)) errors.push(`Sección '${section.type}' falta 'lines'`);
      else {
        section.lines.forEach((line, lIdx) => {
          if (typeof line.lyrics !== 'string') errors.push(`Línea ${lIdx}: 'lyrics' debe ser string`);
          if (Array.isArray(line.chords)) {
            line.chords.forEach(ch => {
              if (typeof ch.position !== 'number' || ch.position < 0 || ch.position > line.lyrics.length) errors.push(`Acorde '${ch.chord}' tiene posición inválida`);
            });
          }
        });
      }
    });
  }
  return { valid: errors.length === 0, errors };
}