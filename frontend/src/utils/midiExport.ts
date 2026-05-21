/**
 * midiExport — client-side MIDI file generation from note arrays.
 * Uses midi-writer-js to produce a standard .mid file blob.
 */
import MidiWriter from "midi-writer-js";
import type { MidiNoteEvent } from "../hooks/useMidiConvert";

/**
 * Convert seconds to MIDI ticks at the given BPM.
 * midi-writer-js uses 128 ticks per beat by default.
 */
function secondsToTicks(seconds: number, bpm: number): number {
  const ticksPerBeat = 128;
  const beatsPerSecond = bpm / 60;
  return Math.round(seconds * beatsPerSecond * ticksPerBeat);
}

/**
 * Export an array of note events to a MIDI file Blob.
 */
export function exportNotesToMidi(
  notes: MidiNoteEvent[],
  bpm: number = 120,
  trackName: string = "Edited",
): Blob {
  const track = new MidiWriter.Track();
  track.setTempo(bpm);
  track.addTrackName(trackName);

  // Sort notes by start time for proper sequencing
  const sorted = [...notes].sort((a, b) => a.start - b.start);

  for (const note of sorted) {
    const startTick = secondsToTicks(note.start, bpm);
    const durationTicks = Math.max(1, secondsToTicks(note.duration, bpm));

    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: note.pitch,
        velocity: Math.max(1, Math.min(127, note.velocity)),
        startTick,
        duration: `T${durationTicks}`,
      }),
    );
  }

  const writer = new MidiWriter.Writer([track]);
  const dataUri = writer.dataUri();

  // Convert data URI to Blob
  const byteString = atob(dataUri.split(",")[1]);
  const mimeString = dataUri.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

/**
 * Trigger a browser download of the MIDI blob.
 */
export function downloadMidiBlob(blob: Blob, filename: string = "edited.mid"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
