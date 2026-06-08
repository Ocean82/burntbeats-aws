import { describe, expect, it } from "vitest";
import { resolvePitchOverlaps, sanitizeSelectedIds } from "./midiEditorNotes";

describe("resolvePitchOverlaps", () => {
  it("trims an earlier note when a later note of the same pitch overlaps", () => {
    const result = resolvePitchOverlaps([
      { id: "a", pitch: 60, start: 0, duration: 1, velocity: 100 },
      { id: "b", pitch: 60, start: 0.5, duration: 1, velocity: 100 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "a", duration: 0.5 });
    expect(result[1]).toMatchObject({ id: "b", start: 0.5, duration: 1 });
  });

  it("replaces an earlier note when two same-pitch notes start at nearly the same time", () => {
    const result = resolvePitchOverlaps([
      { id: "a", pitch: 64, start: 1, duration: 1, velocity: 90 },
      { id: "b", pitch: 64, start: 1.001, duration: 0.5, velocity: 110 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("preserves overlapping notes with different pitches", () => {
    const result = resolvePitchOverlaps([
      { id: "a", pitch: 60, start: 0, duration: 1, velocity: 100 },
      { id: "b", pitch: 64, start: 0.25, duration: 1, velocity: 100 },
    ]);

    expect(result).toHaveLength(2);
  });
});

describe("sanitizeSelectedIds", () => {
  it("drops selections for notes removed during overlap resolution", () => {
    const selected = sanitizeSelectedIds(
      [{ id: "b", pitch: 60, start: 0.5, duration: 1, velocity: 100 }],
      new Set(["a", "b"]),
    );

    expect([...selected]).toEqual(["b"]);
  });
});
