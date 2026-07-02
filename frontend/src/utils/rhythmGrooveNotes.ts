/**
 * Convert server-generated rhythm MIDI into editor-ready notes.
 */
import { generateNoteId } from "../components/midi-convert/editorTypes";
import type { EditableNote } from "../components/midi-convert/editorTypes";
import { parseMidiBuffer } from "./parseMidiNotes";

export function rhythmMidiBase64ToEditableNotes(base64: string): EditableNote[] {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const { notes } = parseMidiBuffer(bytes.buffer);
  return notes.map((note) => ({
    ...note,
    id: generateNoteId(),
  }));
}

export function rhythmMidiBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isLikelyDrumGroove(notes: EditableNote[]): boolean {
  if (!notes.length) return false;
  const pitches = notes.map((n) => n.pitch);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  return max <= 50 && min >= 25;
}
