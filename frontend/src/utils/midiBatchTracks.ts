/**
 * Build editor tracks from completed batch stem conversion jobs.
 */
import type { BatchJob } from "../hooks/useMidiConvert";
import type { EditorTrack, TrackInstrument } from "../components/midi-convert/editorTypes";
import {
  createDefaultTrackMidiFx,
  generateTrackId,
  TRACK_COLORS,
} from "../components/midi-convert/editorTypes";
import { notesFromConversion } from "../hooks/useMidiEditor";
import { isDrumMidiContext } from "./midiStemContext";

function stemInstrument(stemName: string): TrackInstrument {
  const label = stemName.toLowerCase();
  if (/\b(bass|808|sub)\b/.test(label)) return "bass";
  if (/\b(synth|lead|pad|keys|piano)\b/.test(label)) return "piano";
  if (/\b(vocal|voice|strings|violin|cello|guitar)\b/.test(label)) return "strings";
  if (/\b(drums?|perc|kick|snare|hihat|hi-hat)\b/.test(label)) return "synth";
  return "piano";
}

export function editorTracksFromBatchJobs(jobs: BatchJob[]): EditorTrack[] {
  const completed = jobs.filter(
    (job) =>
      job.status === "completed" &&
      job.result &&
      job.result.pianoRollNotes.length > 0,
  );

  return completed.map((job, index) => {
    const drum = isDrumMidiContext(job.stemName, job.result?.fileAnalysis ?? null);
    return {
      id: generateTrackId(),
      name: job.stemName,
      notes: notesFromConversion(job.result!.pianoRollNotes),
      selectedIds: new Set<string>(),
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      muted: false,
      soloed: false,
      instrument: drum ? "synth" : stemInstrument(job.stemName),
      ccLanes: [],
      midiEffects: createDefaultTrackMidiFx(),
      midiFxApplyMode: "replace" as const,
      midiFxPreview: false,
      sourceJobId: job.jobId,
      sourceJobToken: job.jobToken,
    };
  });
}

export function flattenBatchNotes(jobs: BatchJob[]) {
  return editorTracksFromBatchJobs(jobs).flatMap((track) => track.notes);
}

export function tracksWithSourceJobs(tracks: EditorTrack[]): EditorTrack[] {
  return tracks.filter((track) => Boolean(track.sourceJobId));
}

export function canSaveTracksToJobs(
  jobId: string | null | undefined,
  tracks: EditorTrack[],
): boolean {
  return Boolean(jobId) || tracksWithSourceJobs(tracks).length > 0;
}
