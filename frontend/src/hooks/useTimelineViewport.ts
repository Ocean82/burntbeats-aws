import { useEffect, useMemo, useState } from "react";

export interface TimelineViewportState {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  scrollPct: number;
  setScrollPct: React.Dispatch<React.SetStateAction<number>>;
  maxScrollPct: number;
  visibleStart: number;
  visibleEnd: number;
  visibleRange: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function toVisiblePercent(
  absolutePercent: number,
  visibleStart: number,
  visibleRange: number
): number {
  return clamp((absolutePercent / 100 - visibleStart) / visibleRange, 0, 1) * 100;
}

export function toAbsolutePercent(
  visiblePercent: number,
  visibleStart: number,
  visibleRange: number
): number {
  return clamp(visibleStart + (visiblePercent / 100) * visibleRange, 0, 1) * 100;
}

export function useTimelineViewport(
  minimumZoom: number = 1,
  maximumZoom: number = 8,
  initialZoom: number = 1
): TimelineViewportState {
  const [zoom, setZoom] = useState<number>(clamp(initialZoom, minimumZoom, maximumZoom));
  const [scrollPct, setScrollPct] = useState<number>(0);

  const { maxScrollPct, visibleStart, visibleEnd, visibleRange } = useMemo(() => {
    const maxScroll = Math.max(0, 100 - 100 / zoom);
    const start = scrollPct / 100;
    const end = Math.min(1, start + 1 / zoom);
    return {
      maxScrollPct: maxScroll,
      visibleStart: start,
      visibleEnd: end,
      visibleRange: Math.max(end - start, 1e-6),
    };
  }, [scrollPct, zoom]);

  useEffect(() => {
    setScrollPct((previous) => clamp(previous, 0, maxScrollPct));
  }, [maxScrollPct]);

  const setBoundedZoom: React.Dispatch<React.SetStateAction<number>> = (value) => {
    setZoom((previous) => {
      const nextZoom = typeof value === "function" ? value(previous) : value;
      return clamp(nextZoom, minimumZoom, maximumZoom);
    });
  };

  return {
    zoom,
    setZoom: setBoundedZoom,
    scrollPct,
    setScrollPct,
    maxScrollPct,
    visibleStart,
    visibleEnd,
    visibleRange,
  };
}
