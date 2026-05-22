/**
 * Grid snapping helpers for the MIDI note editor.
 */
import type { SnapGrid } from "../hooks/useMidiEditor";

export function getGridSizeSeconds(bpm: number, grid: SnapGrid): number {
  if (grid === "free") return 0;
  const gridDivision = parseInt(grid.split("/")[1], 10);
  return (4 / gridDivision) * (60 / bpm);
}

export function snapToGrid(time: number, bpm: number, grid: SnapGrid): number {
  if (grid === "free") return time;
  const gridSizeSeconds = getGridSizeSeconds(bpm, grid);
  return Math.round(time / gridSizeSeconds) * gridSizeSeconds;
}

export function snapDuration(duration: number, bpm: number, grid: SnapGrid): number {
  if (grid === "free") return Math.max(duration, 0.01);
  const gridSizeSeconds = getGridSizeSeconds(bpm, grid);
  return Math.max(
    Math.round(duration / gridSizeSeconds) * gridSizeSeconds,
    gridSizeSeconds,
  );
}

/** Snap a time delta so multi-note moves keep relative offsets. */
export function snapDeltaTime(deltaTime: number, bpm: number, grid: SnapGrid): number {
  if (grid === "free") return deltaTime;
  const gridSizeSeconds = getGridSizeSeconds(bpm, grid);
  return Math.round(deltaTime / gridSizeSeconds) * gridSizeSeconds;
}
