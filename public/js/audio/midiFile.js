function readVariableLength(bytes, cursor) {
  let value = 0, byte = 0;
  do {
    if (cursor.index >= bytes.length) throw new Error('El archivo MIDI está incompleto.');
    byte = bytes[cursor.index++];
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return value;
}

function fourCC(bytes, index) {
  return String.fromCharCode(bytes[index], bytes[index + 1], bytes[index + 2], bytes[index + 3]);
}

/** Minimal Standard MIDI File reader for note events and tempo maps. */
export function parseMidiFile(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14 || fourCC(bytes, 0) !== 'MThd') throw new Error('El archivo no parece ser un MIDI estándar.');
  const view = new DataView(buffer);
  const headerLength = view.getUint32(4, false);
  const trackCount = view.getUint16(10, false);
  const ticksPerQuarter = view.getUint16(12, false);
  if (!ticksPerQuarter || ticksPerQuarter & 0x8000) throw new Error('El MIDI usa una división de tiempo SMPTE no compatible todavía.');
  const tempoEvents = [{ tick: 0, microsecondsPerQuarter: 500000 }];
  const tracks = [];
  let offset = 8 + headerLength;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (fourCC(bytes, offset) !== 'MTrk') throw new Error('No se encontró una pista MIDI válida.');
    const length = view.getUint32(offset + 4, false);
    const end = offset + 8 + length;
    const cursor = { index: offset + 8 };
    let tick = 0, runningStatus = 0;
    const notes = [], active = new Map();
    while (cursor.index < end) {
      tick += readVariableLength(bytes, cursor);
      let status = bytes[cursor.index++];
      if (status < 0x80) { cursor.index--; status = runningStatus; }
      else if (status < 0xf0) runningStatus = status;
      if (status === 0xff) {
        const type = bytes[cursor.index++], size = readVariableLength(bytes, cursor);
        if (type === 0x51 && size === 3) {
          const tempo = bytes[cursor.index] * 65536 + bytes[cursor.index + 1] * 256 + bytes[cursor.index + 2];
          if (tempo > 0) tempoEvents.push({ tick, microsecondsPerQuarter: tempo });
        }
        cursor.index += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { cursor.index += readVariableLength(bytes, cursor); continue; }
      if (status >= 0xf0) throw new Error('El MIDI contiene un evento de sistema no compatible.');
      const command = status & 0xf0, channel = status & 0x0f;
      const first = bytes[cursor.index++];
      if (command === 0xc0 || command === 0xd0) { continue; }
      const second = bytes[cursor.index++];
      if (command !== 0x80 && command !== 0x90) continue;
      const isOn = command === 0x90 && second > 0;
      const key = `${channel}:${first}`;
      if (isOn) {
        const queue = active.get(key) || [];
        queue.push({ midi: first, startTick: tick, velocity: second / 127, channel });
        active.set(key, queue);
      } else {
        const queue = active.get(key);
        const note = queue?.shift();
        if (note) notes.push({ ...note, endTick: Math.max(tick, note.startTick + 1) });
      }
    }
    const trackEndTick = tick;
    for (const queue of active.values()) for (const note of queue) notes.push({ ...note, endTick: trackEndTick });
    tracks.push({ index: trackIndex + 1, notes });
    offset = end;
  }

  tempoEvents.sort((left, right) => left.tick - right.tick);
  const tickToMs = (targetTick) => {
    let previousTick = 0, elapsedUs = 0, tempo = tempoEvents[0].microsecondsPerQuarter;
    for (const item of tempoEvents.slice(1)) {
      if (item.tick >= targetTick) break;
      elapsedUs += (item.tick - previousTick) * tempo / ticksPerQuarter;
      previousTick = item.tick; tempo = item.microsecondsPerQuarter;
    }
    elapsedUs += (targetTick - previousTick) * tempo / ticksPerQuarter;
    return elapsedUs / 1000;
  };
  return tracks.map((track) => ({
    ...track,
    events: track.notes.map((note) => ({ ...note, startMs: tickToMs(note.startTick), endMs: tickToMs(note.endTick) })),
  })).filter((track) => track.events.length);
}
