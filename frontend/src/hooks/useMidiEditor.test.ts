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
});
