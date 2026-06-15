/**
 * midiExport — client-side MIDI file generation from note arrays.
 * Uses midi-writer-js to produce a standard .mid file blob.
 */
import MidiWriter from "midi-writer-js";
import type { MidiNoteEvent } from "../hooks/useMidiConvert";
import type { EditorTrack } from "../components/midi-convert/editorTypes";
import type { SectionMarker } from "../components/midi-convert/MarkerStrip";

export interface MidiExportOptions {
  markers?: SectionMarker[];
}

export interface MidiExportResult {
  blob: Blob;
  markersExported: number;
  markersRequested: number;
}

/** True when midi-writer-js exposes timed marker meta events. */
export function midiMarkerExportSupported(): boolean {
  return typeof MidiWriter.MarkerEvent === "function";
}

/**
 * Convert seconds to MIDI ticks at the given BPM.
 * midi-writer-js uses 128 ticks per beat by default.
 */
function secondsToTicks(seconds: number, bpm: number): number {
  const ticksPerBeat = 128;
  const beatsPerSecond = bpm / 60;
  return Math.round(seconds * beatsPerSecond * ticksPerBeat);
}

function dataUriToBlob(dataUri: string): Blob {
  const byteString = atob(dataUri.split(",")[1]);
  const mimeString = dataUri.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

function addMarkersToTrack(
  track: InstanceType<typeof MidiWriter.Track>,
  markers: SectionMarker[],
  bpm: number,
): number {
  if (!midiMarkerExportSupported() || markers.length === 0) return 0;

  const sorted = [...markers].sort((a, b) => a.time - b.time);
  let previousTick = 0;
  let exported = 0;

  for (const marker of sorted) {
    const absoluteTick = secondsToTicks(marker.time, bpm);
    const delta = Math.max(0, absoluteTick - previousTick);
    track.addEvent(
      new MidiWriter.MarkerEvent({
        text: marker.label,
        delta,
      }),
    );
    previousTick = absoluteTick;
    exported += 1;
  }

  return exported;
}

function buildTrackFromEditorTrack(
  track: EditorTrack,
  bpm: number,
  markers?: SectionMarker[],
  includeMarkers = false,
): { writerTrack: InstanceType<typeof MidiWriter.Track>; markersExported: number } {
  const writerTrack = new MidiWriter.Track();
  writerTrack.setTempo(bpm);
  writerTrack.addTrackName(track.name);

  const markersExported =
    includeMarkers && markers?.length
      ? addMarkersToTrack(writerTrack, markers, bpm)
      : 0;

  const sorted = [...track.notes]
    .filter((note) => !note.muted)
    .sort((a, b) => a.start - b.start);
  for (const note of sorted) {
    const startTick = secondsToTicks(note.start, bpm);
    const durationTicks = Math.max(1, secondsToTicks(note.duration, bpm));
    writerTrack.addEvent(
      new MidiWriter.NoteEvent({
        pitch: note.pitch,
        velocity: Math.max(1, Math.min(127, note.velocity)),
        startTick,
        duration: `T${durationTicks}`,
        channel: Math.max(1, Math.min(16, note.channel ?? 1)),
      }),
    );
  }

  for (const lane of track.ccLanes) {
    if (!lane.events.length) continue;
    const sortedCc = [...lane.events].sort((a, b) => a.time - b.time);
    for (const point of sortedCc) {
      writerTrack.addEvent(
        new MidiWriter.ControllerChangeEvent({
          controllerNumber: lane.ccNumber,
          controllerValue: Math.max(0, Math.min(127, Math.round(point.value))),
          delta: secondsToTicks(point.time, bpm),
        }),
      );
    }
  }

  return { writerTrack, markersExported };
}

/**
 * Export multiple editor tracks to a MIDI file Blob.
 */
export function exportTracksToMidi(
  tracks: EditorTrack[],
  bpm: number = 120,
  options?: MidiExportOptions,
): MidiExportResult {
  const markerCount = options?.markers?.length ?? 0;
  const nonEmpty = tracks.filter(
    (t) => t.notes.length > 0 || t.ccLanes.some((l) => l.events.length > 0),
  );
  let markersExported = 0;
  const writerTracks = (nonEmpty.length ? nonEmpty : tracks.slice(0, 1)).map(
    (t, index) => {
      const built = buildTrackFromEditorTrack(
        t,
        bpm,
        options?.markers,
        index === 0,
      );
      if (index === 0) markersExported = built.markersExported;
      return built.writerTrack;
    },
  );
  const writer = new MidiWriter.Writer(writerTracks);
  return {
    blob: dataUriToBlob(writer.dataUri()),
    markersExported,
    markersRequested: markerCount,
  };
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
  return dataUriToBlob(writer.dataUri());
}

/**
 * Trigger a browser download of the MIDI blob.
 */
export function downloadMidiBlob(
  blob: Blob,
  filename: string = "edited.mid",
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
