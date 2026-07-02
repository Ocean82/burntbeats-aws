import { describe, expect, it } from "vitest";
import type { BatchJob } from "../hooks/useMidiConvert";
import { editorTracksFromBatchJobs, canSaveTracksToJobs, tracksWithSourceJobs } from "./midiBatchTracks";

function makeBatchJob(
  stemName: string,
  notes: { pitch: number; start: number; duration: number; velocity: number }[],
): BatchJob {
  return {
    stemName,
    jobId: "12121212-1212-4212-8212-121212121212",
    jobToken: null,
    fileUrl: null,
    status: "completed",
    result: {
      notesDetected: notes.length,
      durationSeconds: 4,
      tracks: 1,
      inferenceTimeSeconds: 1,
      pianoRollNotes: notes,
      analysis: null,
      fileAnalysis: null,
    },
    error: null,
  };
}

describe("editorTracksFromBatchJobs", () => {
  it("creates one editor track per completed batch job with notes", () => {
    const tracks = editorTracksFromBatchJobs([
      makeBatchJob("vocals", [{ pitch: 60, start: 0, duration: 1, velocity: 90 }]),
      makeBatchJob("bass", [{ pitch: 36, start: 0, duration: 1, velocity: 100 }]),
      {
        ...makeBatchJob("drums", []),
        status: "failed",
        result: null,
      },
    ]);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].name).toBe("vocals");
    expect(tracks[1].name).toBe("bass");
    expect(tracks[1].instrument).toBe("bass");
    expect(tracks[0].notes).toHaveLength(1);
    expect(tracks[0].sourceJobId).toBe("12121212-1212-4212-8212-121212121212");
  });

  it("marks drum stems with synth instrument preset", () => {
    const tracks = editorTracksFromBatchJobs([
      makeBatchJob("drums", [{ pitch: 36, start: 0, duration: 0.25, velocity: 110 }]),
    ]);
    expect(tracks[0].instrument).toBe("synth");
  });

  it("exposes per-stem job ids for batch save", () => {
    const tracks = editorTracksFromBatchJobs([
      makeBatchJob("vocals", [{ pitch: 60, start: 0, duration: 1, velocity: 90 }]),
      makeBatchJob("bass", [{ pitch: 36, start: 0, duration: 1, velocity: 100 }]),
    ]);
    expect(tracksWithSourceJobs(tracks)).toHaveLength(2);
    expect(canSaveTracksToJobs(null, tracks)).toBe(true);
    expect(canSaveTracksToJobs("job-1", [])).toBe(true);
  });
});
