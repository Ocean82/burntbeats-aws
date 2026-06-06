import { describe, expect, it } from "vitest";
import { exportTracksToMidi } from "./midiExport";
import type { EditorTrack } from "../components/midi-convert/editorTypes";
import { BUILTIN_CC_LANES } from "../components/midi-convert/editorTypes";

function makeTrack(id: string, name: string, notes: EditorTrack["notes"], ccEvents?: { cc: number; time: number; value: number }[]): EditorTrack {
  return {
    id,
    name,
    notes,
    selectedIds: new Set(),
    color: "#cd9d3c",
    muted: false,
    soloed: false,
    instrument: "piano",
    ccLanes: BUILTIN_CC_LANES.map((lane) => ({
      ...lane,
      events:
        ccEvents?.filter((e) => e.cc === lane.ccNumber).map((e) => ({ time: e.time, value: e.value })) ?? [],
    })),
  };
}

describe("exportTracksToMidi", () => {
  it("exports multiple tracks with CC events", () => {
    const tracks: EditorTrack[] = [
      makeTrack("t1", "Melody", [
        { id: "n1", pitch: 60, start: 0, duration: 0.5, velocity: 100 },
      ]),
      makeTrack("t2", "Bass", [
        { id: "n2", pitch: 36, start: 0, duration: 1, velocity: 90 },
      ], [{ cc: 7, time: 0, value: 100 }]),
    ];

    const blob = exportTracksToMidi(tracks, 120);
    expect(blob.type).toMatch(/audio\/midi|application\/octet-stream/);
    expect(blob.size).toBeGreaterThan(50);
  });
});
