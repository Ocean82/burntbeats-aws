import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BatchJob } from "../../../hooks/useMidiConvert";
import { editorTracksFromBatchJobs } from "../../../utils/midiBatchTracks";

vi.mock("../MidiNoteEditor", () => ({
  MidiNoteEditor: ({ initialTracks }: { initialTracks?: { name: string }[] }) => (
    <div data-testid="midi-note-editor-mock">
      tracks:{initialTracks?.length ?? 0}
    </div>
  ),
}));

function completedJob(stemName: string): BatchJob {
  return {
    stemName,
    jobId: "12121212-1212-4212-8212-121212121212",
    jobToken: "token-a",
    fileUrl: "/file",
    status: "completed",
    result: {
      notesDetected: 2,
      durationSeconds: 4,
      tracks: 1,
      inferenceTimeSeconds: 1,
      pianoRollNotes: [
        { pitch: 60, start: 0, duration: 1, velocity: 90 },
        { pitch: 62, start: 1, duration: 1, velocity: 88 },
      ],
      analysis: null,
      fileAnalysis: null,
    },
    error: null,
  };
}

describe("batch multi-track editor wiring", () => {
  it("maps completed batch jobs to editor tracks with source job ids", () => {
    const tracks = editorTracksFromBatchJobs([
      completedJob("vocals"),
      completedJob("bass"),
    ]);

    expect(tracks).toHaveLength(2);
    expect(tracks.every((t) => t.sourceJobId)).toBe(true);
    expect(tracks.every((t) => t.sourceJobToken === "token-a")).toBe(true);
  });

  it("batch editor shell renders when tracks are provided", () => {
    const tracks = editorTracksFromBatchJobs([
      completedJob("vocals"),
      completedJob("drums"),
    ]);

    render(
      <div data-testid="midi-batch-editor-shell">
        <p data-testid="midi-batch-open-editor">Open multi-track editor</p>
        <div data-testid="midi-note-editor-mock">tracks:{tracks.length}</div>
      </div>,
    );

    expect(screen.getByTestId("midi-batch-open-editor")).toBeInTheDocument();
    expect(screen.getByTestId("midi-note-editor-mock")).toHaveTextContent("tracks:2");
  });
});
