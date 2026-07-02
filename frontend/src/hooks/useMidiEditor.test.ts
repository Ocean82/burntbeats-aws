import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMidiEditor } from "./useMidiEditor";

const initialNotes = [{ pitch: 60, start: 0, duration: 0.5, velocity: 80 }];

describe("useMidiEditor scale constraint", () => {
  it("snaps added notes to locked scale", () => {
    const { result } = renderHook(() => useMidiEditor(initialNotes, 120));

    act(() => {
      result.current.setScaleConstraint({
        root: "C",
        scale: "major",
        locked: true,
      });
      result.current.addNote(61, 1);
    });

    const added = result.current.notes.find((n) => n.pitch === 60 && n.start > 0);
    expect(added).toBeDefined();
  });

  it("does not snap when scale constraint is cleared for drum content", () => {
    const { result } = renderHook(() => useMidiEditor(initialNotes, 120));

    act(() => {
      result.current.setScaleConstraint({
        root: "C",
        scale: "major",
        locked: true,
      });
      result.current.setScaleConstraint(null);
      result.current.addNote(61, 1);
    });

    const added = result.current.notes.find((n) => n.pitch === 61);
    expect(added).toBeDefined();
  });

  it("adds a new track with notes and selects it", () => {
    const { result } = renderHook(() => useMidiEditor(initialNotes, 120));
    const groove = [
      { id: "g1", pitch: 36, start: 0, duration: 0.1, velocity: 100 },
    ];

    act(() => {
      result.current.addTrackWithNotes("Rock groove", groove, "synth");
    });

    expect(result.current.tracks).toHaveLength(2);
    expect(result.current.tracks[1]?.name).toBe("Rock groove");
    expect(result.current.tracks[1]?.notes).toHaveLength(1);
    expect(result.current.activeTrackId).toBe(result.current.tracks[1]?.id);
    expect(result.current.isModified).toBe(true);
  });
});
