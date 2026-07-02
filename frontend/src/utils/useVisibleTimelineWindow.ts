import { useMemo } from "react";
import { barDurationSeconds } from "./midiTimeline";

export interface VisibleTimelineWindow {
  scrollLeft: number;
  viewportWidth: number;
  pixelsPerSecond: number;
  leftMargin: number;
  marginBars: number;
  bpm: number;
  timeStart: number;
  timeEnd: number;
  xStart: number;
  xEnd: number;
}

export interface VisibleTimelineWindowInput {
  scrollLeft: number;
  viewportWidth: number;
  pixelsPerSecond: number;
  leftMargin: number;
  marginBars?: number;
  bpm?: number;
}

export function computeVisibleTimelineWindow({
  scrollLeft,
  viewportWidth,
  pixelsPerSecond,
  leftMargin,
  marginBars = 1,
  bpm = 120,
}: VisibleTimelineWindowInput): VisibleTimelineWindow {
  const safePps = Math.max(pixelsPerSecond, 1);
  const marginSeconds = barDurationSeconds(bpm, 4) * Math.max(0, marginBars);
  const xStart = Math.max(0, scrollLeft);
  const xEnd = xStart + Math.max(0, viewportWidth);
  const timeStart = Math.max(0, xStart / safePps - marginSeconds);
  const timeEnd = xEnd / safePps + marginSeconds;

  return {
    scrollLeft,
    viewportWidth,
    pixelsPerSecond: safePps,
    leftMargin,
    marginBars,
    bpm,
    timeStart,
    timeEnd,
    xStart,
    xEnd,
  };
}

export function isNoteVisibleInWindow(
  noteStart: number,
  noteEnd: number,
  window: Pick<VisibleTimelineWindow, "timeStart" | "timeEnd">,
): boolean {
  return noteEnd >= window.timeStart && noteStart <= window.timeEnd;
}

export interface NoteTimeRange {
  start: number;
  duration: number;
}

/** Binary search range of notes (sorted by start) overlapping a time window. */
export function findOverlappingNoteRange<T extends { note: NoteTimeRange }>(
  sortedRects: T[],
  window: Pick<VisibleTimelineWindow, "timeStart" | "timeEnd">,
): { start: number; end: number } {
  if (!sortedRects.length) return { start: 0, end: -1 };

  let lo = 0;
  let hi = sortedRects.length - 1;
  let first = sortedRects.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const noteEnd = sortedRects[mid].note.start + sortedRects[mid].note.duration;
    if (noteEnd >= window.timeStart) {
      first = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  lo = first;
  hi = sortedRects.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedRects[mid].note.start <= window.timeEnd) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { start: first, end: last };
}

export function useVisibleTimelineWindow(
  input: VisibleTimelineWindowInput,
): VisibleTimelineWindow {
  const {
    scrollLeft,
    viewportWidth,
    pixelsPerSecond,
    leftMargin,
    marginBars = 1,
    bpm = 120,
  } = input;

  return useMemo(
    () =>
      computeVisibleTimelineWindow({
        scrollLeft,
        viewportWidth,
        pixelsPerSecond,
        leftMargin,
        marginBars,
        bpm,
      }),
    [scrollLeft, viewportWidth, pixelsPerSecond, leftMargin, marginBars, bpm],
  );
}
