import { describe, expect, it } from "vitest";
import { getGridSizeSeconds, snapDeltaTime, snapDuration, snapToGrid } from "./midiEditorSnap";

describe("midiEditorSnap", () => {
  const bpm = 120;

  it("computes 1/16 grid size at 120 BPM", () => {
    expect(getGridSizeSeconds(bpm, "1/16")).toBeCloseTo(0.125);
  });

  it("snaps time to nearest grid line", () => {
    expect(snapToGrid(0.13, bpm, "1/16")).toBeCloseTo(0.125);
    expect(snapToGrid(0.19, bpm, "1/16")).toBeCloseTo(0.25);
  });

  it("leaves time unchanged in free mode", () => {
    expect(snapToGrid(0.137, bpm, "free")).toBeCloseTo(0.137);
  });

  it("snaps duration to at least one grid cell", () => {
    expect(snapDuration(0.05, bpm, "1/16")).toBeCloseTo(0.125);
  });

  it("snaps delta time for group moves", () => {
    expect(snapDeltaTime(0.13, bpm, "1/16")).toBeCloseTo(0.125);
    expect(snapDeltaTime(0.01, bpm, "1/16")).toBeCloseTo(0);
  });
});
