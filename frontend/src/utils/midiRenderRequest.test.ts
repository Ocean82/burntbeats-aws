import { describe, expect, it } from "vitest";
import type { EditorTrack } from "../components/midi-convert/editorTypes";
import { createDefaultTrackMidiFx, generateNoteId, generateTrackId } from "../components/midi-convert/editorTypes";
import { buildRenderRequest } from "./midiRenderRequest";

function makeTrack(
  name: string,
  notes: { pitch: number; start: number; duration: number; velocity: number }[],
  instrument: "piano" | "bass" = "piano",
): EditorTrack {
  return {
    id: generateTrackId(),
    name,
    notes: notes.map((n) => ({ ...n, id: generateNoteId() })),
    selectedIds: new Set(),
    color: "#cd9d3c",
    muted: false,
    soloed: false,
    instrument,
    ccLanes: [],
    midiEffects: createDefaultTrackMidiFx(),
    midiFxApplyMode: "replace",
    midiFxPreview: false,
  };
}

describe("buildRenderRequest", () => {
  it("uses source_job_id when unmodified single track", () => {
    const tracks = [makeTrack("Melody", [{ pitch: 60, start: 0, duration: 1, velocity: 90 }])];
    const req = buildRenderRequest({
      tracks,
      bpm: 120,
      sourceJobId: "12121212-1212-4212-8212-121212121212",
      preferLiveState: false,
    });
    expect(req.source_job_id).toBe("12121212-1212-4212-8212-121212121212");
    expect(req.notes).toBeUndefined();
  });

  it("sends live notes when editor is modified", () => {
    const tracks = [makeTrack("Melody", [{ pitch: 62, start: 0, duration: 1, velocity: 90 }])];
    const req = buildRenderRequest({
      tracks,
      bpm: 128,
      sourceJobId: "12121212-1212-4212-8212-121212121212",
      preferLiveState: true,
    });
    expect(req.source_job_id).toBeUndefined();
    expect(req.notes).toHaveLength(1);
    expect(req.notes?.[0].pitch).toBe(62);
    expect(req.bpm).toBe(128);
  });

  it("sends multi-track payload with per-track instruments", () => {
    const tracks = [
      makeTrack("Melody", [{ pitch: 60, start: 0, duration: 1, velocity: 90 }], "piano"),
      makeTrack("Bass", [{ pitch: 36, start: 0, duration: 1, velocity: 100 }], "bass"),
    ];
    const req = buildRenderRequest({
      tracks,
      bpm: 120,
      sourceJobId: "12121212-1212-4212-8212-121212121212",
      preferLiveState: false,
    });
    expect(req.source_job_id).toBeUndefined();
    expect(req.notes).toHaveLength(2);
    expect(req.tracks).toHaveLength(2);
    expect(req.tracks?.[1].instrument).toBe(33);
  });
});
