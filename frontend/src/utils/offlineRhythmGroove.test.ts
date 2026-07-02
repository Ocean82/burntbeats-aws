import { describe, expect, it } from "vitest";
import { generateOfflineGrooveNotes } from "./offlineRhythmGroove";

describe("generateOfflineGrooveNotes", () => {
  it("produces drum-range notes for rock style", () => {
    const notes = generateOfflineGrooveNotes({
      style: "rock",
      bars: 2,
      tempo: 120,
      energy: 0.8,
    });
    expect(notes.length).toBeGreaterThan(4);
    expect(Math.min(...notes.map((n) => n.pitch))).toBeGreaterThanOrEqual(35);
    expect(Math.max(...notes.map((n) => n.pitch))).toBeLessThanOrEqual(57);
  });

  it("scales note count with bars", () => {
    const twoBars = generateOfflineGrooveNotes({
      style: "edm",
      bars: 2,
      tempo: 128,
      energy: 0.9,
    });
    const fourBars = generateOfflineGrooveNotes({
      style: "edm",
      bars: 4,
      tempo: 128,
      energy: 0.9,
    });
    expect(fourBars.length).toBeGreaterThan(twoBars.length);
  });
});
