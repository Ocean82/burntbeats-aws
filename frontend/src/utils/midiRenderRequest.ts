/**
 * Build MIDI-to-audio render payloads from editor state.
 */
import type { RenderNote, RenderRequest, RenderTrack } from "../api/midiRender";
import type { EditorTrack, TrackInstrument } from "../components/midi-convert/editorTypes";

export const INSTRUMENT_PROGRAM: Record<TrackInstrument, number> = {
  piano: 0,
  synth: 80,
  bass: 33,
  strings: 48,
};

export interface BuildRenderRequestOptions {
  tracks: EditorTrack[];
  bpm: number;
  format?: "wav" | "mp3";
  soundfont?: string;
  sourceJobId?: string | null;
  /** When true, send live editor notes instead of the saved job MIDI file. */
  preferLiveState?: boolean;
  normalize?: boolean;
  masterGain?: number;
}

function flattenAudibleNotes(tracks: EditorTrack[]): RenderNote[] {
  const hasSolo = tracks.some((t) => t.soloed);
  const notes: RenderNote[] = [];

  tracks.forEach((track, trackIndex) => {
    if (hasSolo && !track.soloed) return;
    if (!hasSolo && track.muted) return;

    const channel = Math.min(trackIndex, 15);
    for (const note of track.notes) {
      if (note.muted) continue;
      notes.push({
        pitch: note.pitch,
        start: note.start,
        duration: note.duration,
        velocity: note.velocity,
        channel: note.channel ?? channel,
      });
    }
  });

  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

function buildRenderTracks(tracks: EditorTrack[]): RenderTrack[] {
  return tracks.map((track, index) => ({
    stem_name: track.name,
    instrument: INSTRUMENT_PROGRAM[track.instrument] ?? 0,
    channel: Math.min(index, 15),
  }));
}

/**
 * Prefer live editor state when modified or multi-track; otherwise use saved job MIDI.
 */
export function buildRenderRequest(options: BuildRenderRequestOptions): RenderRequest {
  const {
    tracks,
    bpm,
    format = "wav",
    soundfont,
    sourceJobId = null,
    preferLiveState = false,
    normalize = true,
    masterGain = 0.9,
  } = options;

  const notes = flattenAudibleNotes(tracks);
  const useLiveState = preferLiveState || tracks.length > 1;

  const base = {
    bpm,
    format,
    normalize,
    master_gain: masterGain,
    ...(soundfont ? { soundfont } : {}),
  };

  const defaultInstrument =
    INSTRUMENT_PROGRAM[tracks[0]?.instrument ?? "piano"] ?? 0;

  if (!useLiveState && sourceJobId) {
    return {
      ...base,
      source_job_id: sourceJobId,
      instrument: defaultInstrument,
    };
  }

  if (notes.length === 0 && sourceJobId) {
    return {
      ...base,
      source_job_id: sourceJobId,
      instrument: defaultInstrument,
    };
  }

  return {
    ...base,
    notes,
    tracks: buildRenderTracks(tracks),
    instrument: defaultInstrument,
  };
}
