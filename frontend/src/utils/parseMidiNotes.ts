/**
 * Minimal MIDI type-0 parser — extracts note events for Tone.js preview playback.
 */
import type { MidiNoteEvent } from "../hooks/useMidiConvert";

const MIDI_HEADER = 0x4d546864;
const MIDI_TRACK = 0x4d54726b;

function readVarLen(data: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let i = offset;
  while (i < data.length) {
    const b = data[i++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, next: i };
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  ) >>> 0;
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

/**
 * Parse a MIDI ArrayBuffer into note events with start/duration in seconds.
 */
export function parseMidiBuffer(buffer: ArrayBuffer): { notes: MidiNoteEvent[]; bpm: number } {
  const data = new Uint8Array(buffer);
  if (data.length < 14) return { notes: [], bpm: 120 };

  const headerTag = readUint32(data, 0);
  if (headerTag !== MIDI_HEADER) return { notes: [], bpm: 120 };

  const numTracks = readUint16(data, 10);
  const division = readUint16(data, 12);
  const ticksPerBeat = division & 0x8000 ? 480 : division;
  let bpm = 120;
  const notes: MidiNoteEvent[] = [];
  let offset = 14;

  for (let t = 0; t < numTracks && offset + 8 <= data.length; t++) {
    const trackTag = readUint32(data, offset);
    if (trackTag !== MIDI_TRACK) break;
    const trackLen = readUint32(data, offset + 4);
    offset += 8;
    const trackEnd = offset + trackLen;

    let tick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();
    let runningStatus = 0;

    while (offset < trackEnd && offset < data.length) {
      const delta = readVarLen(data, offset);
      tick += delta.value;
      offset = delta.next;
      if (offset >= trackEnd) break;

      let status = data[offset];
      if (status < 0x80) {
        if (runningStatus === 0) break;
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status;
      }

      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (type === 0x80 || type === 0x90) {
        if (offset + 1 >= trackEnd) break;
        const pitch = data[offset++];
        const velocity = data[offset++];
        if (type === 0x90 && velocity > 0) {
          activeNotes.set(pitch, { tick, velocity });
        } else {
          const start = activeNotes.get(pitch);
          if (start) {
            const startSec = (start.tick / ticksPerBeat) * (60 / bpm);
            const endSec = (tick / ticksPerBeat) * (60 / bpm);
            notes.push({
              pitch,
              start: startSec,
              duration: Math.max(0.01, endSec - startSec),
              velocity: start.velocity,
            });
            activeNotes.delete(pitch);
          }
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        offset += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        offset += 1;
      } else if (status === 0xff) {
        if (offset >= trackEnd) break;
        const metaType = data[offset++];
        const len = readVarLen(data, offset);
        offset = len.next;
        if (metaType === 0x51 && len.value === 3 && offset + 2 < trackEnd) {
          const usPerBeat = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
          bpm = Math.round(60000000 / usPerBeat);
        }
        offset += len.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(data, offset);
        offset = len.next + len.value;
      } else {
        break;
      }

      void channel;
    }

    offset = trackEnd;
  }

  return { notes, bpm };
}
