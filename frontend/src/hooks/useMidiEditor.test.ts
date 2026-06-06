import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMidiEditor } from "./useMidiEditor";

const initialNotes = [
  { pitch: 60, start: 1, duration: 0.5, velocity: 100 },
  { pitch: 60, start: 1.5, duration: 0.5, velocity: 100 },
  { pitch: 60, start: 3, duration: 0.5, velocity: 100 },
];

describe("useMidiEditor", () => {
  it("pasteClipboard preserves relative spacing after track end", () => {
    const { result } = renderHook(() => useMidiEditor(initialNotes, 120));

    act(() => {
      result.current.selectNotes([result.current.notes[0].id, result.current.notes[1].id], false);
      result.current.copySelected();
    });

    const beforeCount = result.current.notes.length;

    act(() => {
      result.current.pasteClipboard();
    });

    expect(result.current.notes.length).toBe(beforeCount + 2);
    const pasted = result.current.notes.slice(-2).sort((a, b) => a.start - b.start);
    expect(pasted[1].start - pasted[0].start).toBeCloseTo(0.5, 2);
    expect(pasted[0].start).toBeGreaterThan(3);
  });

  it("joinSelected requires adjacent same-pitch notes", () => {
    const { result } = renderHook(() => useMidiEditor(initialNotes, 120));

    const adjacentIds = [
      result.current.notes[0].id,
      result.current.notes[1].id,
    ];
    const nonAdjacentIds = [
      result.current.notes[0].id,
      result.current.notes[2].id,
    ];

    act(() => {
      result.current.selectNotes(nonAdjacentIds, false);
      result.current.joinSelected();
    });
    expect(result.current.notes.length).toBe(3);

    act(() => {
      result.current.selectNotes(adjacentIds, false);
      result.current.joinSelected();
    });
    expect(result.current.notes.length).toBe(2);
    const merged = result.current.notes.find((n) => n.pitch === 60 && n.duration > 0.9);
    expect(merged).toBeDefined();
  });

  it("finishRecordedNote sets duration from note-on to note-off", () => {
    const { result } = renderHook(() => useMidiEditor([], 120));

    let noteId = "";
    act(() => {
      noteId = result.current.beginRecordedNote(60, 1, 100);
    });

    const afterOn = result.current.notes.find((n) => n.id === noteId);
    expect(afterOn).toBeDefined();
    expect(afterOn?.start).toBeCloseTo(1, 2);

    act(() => {
      result.current.finishRecordedNote(noteId, 1.5);
    });

    const afterOff = result.current.notes.find((n) => n.id === noteId);
    expect(afterOff?.duration).toBeCloseTo(0.5, 2);
  });
});
