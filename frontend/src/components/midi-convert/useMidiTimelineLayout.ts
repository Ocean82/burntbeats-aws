import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableNote } from "./editorTypes";
import { clampEditorZoom, BASE_PIXELS_PER_SECOND } from "./pianoRollTheme";

const LEFT_MARGIN = 48;

export interface MidiTimelineLayout {
  minStart: number;
  duration: number;
  totalDuration: number;
  pixelsPerSecond: number;
  timelineWidth: number;
  leftMargin: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function useMidiTimelineLayout(
  notes: EditableNote[],
  zoomLevel: number,
  viewportWidth: number,
): MidiTimelineLayout {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { minStart, duration, totalDuration } = useMemo(() => {
    if (!notes.length) {
      return { minStart: 0, duration: 4, totalDuration: 4 };
    }
    const starts = notes.map((n) => n.start);
    const ends = notes.map((n) => n.start + n.duration);
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const dur = Math.max(max - min, 0.25);
    return {
      minStart: min,
      duration: dur,
      totalDuration: Math.max(max * 1.1, 4),
    };
  }, [notes]);

  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * clampEditorZoom(zoomLevel);
  const timelineWidth = Math.max(
    viewportWidth - LEFT_MARGIN,
    Math.ceil(totalDuration * pixelsPerSecond),
  );

  return {
    minStart,
    duration,
    totalDuration,
    pixelsPerSecond,
    timelineWidth,
    leftMargin: LEFT_MARGIN,
    scrollRef,
  };
}

export function useTimelineViewportWidth(containerRef: React.RefObject<HTMLElement | null>): number {
  const [viewportWidth, setViewportWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setViewportWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return viewportWidth;
}
