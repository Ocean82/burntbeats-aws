import { describe, expect, it } from "vitest";
import {
  computeVisibleTimelineWindow,
  findOverlappingNoteRange,
  isNoteVisibleInWindow,
} from "./useVisibleTimelineWindow";

describe("useVisibleTimelineWindow", () => {
  it("maps scroll position to visible time range with margin bars", () => {
    const window = computeVisibleTimelineWindow({
      scrollLeft: 80,
      viewportWidth: 400,
      pixelsPerSecond: 80,
      leftMargin: 56,
      marginBars: 1,
      bpm: 120,
    });

    expect(window.timeStart).toBeCloseTo(0, 2);
    expect(window.timeEnd).toBeCloseTo(6 + 2, 2);
  });

  it("detects note overlap with visible window", () => {
    const window = computeVisibleTimelineWindow({
      scrollLeft: 160,
      viewportWidth: 320,
      pixelsPerSecond: 80,
      leftMargin: 56,
      marginBars: 0,
      bpm: 120,
    });

    expect(isNoteVisibleInWindow(1, 2, window)).toBe(true);
    expect(isNoteVisibleInWindow(10, 11, window)).toBe(false);
  });

  it("finds overlapping note range with binary search", () => {
    const window = computeVisibleTimelineWindow({
      scrollLeft: 0,
      viewportWidth: 320,
      pixelsPerSecond: 80,
      leftMargin: 56,
      marginBars: 0,
      bpm: 120,
    });

    const rects = [
      { note: { start: 0, duration: 0.5 } },
      { note: { start: 2, duration: 0.5 } },
      { note: { start: 4, duration: 0.5 } },
      { note: { start: 8, duration: 0.5 } },
    ];

    const range = findOverlappingNoteRange(rects, window);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThanOrEqual(2);
    expect(range.end).toBeLessThan(3);
  });
});
