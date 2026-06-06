import type { SnapGrid, TimeSignature } from "../components/midi-convert/editorTypes";
import { DEFAULT_TIME_SIG } from "../components/midi-convert/editorTypes";

function beatDuration(bpm: number): number {
  return 60 / bpm;
}

function barDuration(bpm: number, ts: TimeSignature): number {
  return beatDuration(bpm) * ts.beatsPerBar;
}

/**
 * Returns the grid size in seconds for the given snap grid,
 * time signature, and BPM.
 */
export function getGridSizeSeconds(
  bpm: number,
  grid: SnapGrid,
  _ts: TimeSignature = DEFAULT_TIME_SIG,
): number {
  if (grid === "free") return 0;

  const beat = beatDuration(bpm);

  switch (grid) {
    case "1/4":
      return beat;
    case "1/8":
      return beat / 2;
    case "1/16":
      return beat / 4;
    case "1/32":
      return beat / 8;
    case "1/6":
      return beat / 1.5;
    case "1/12":
      return beat / 3;
    case "1T":
      return beat / 3;
    case "dotted":
      return beat * 1.5;
    case "shuffle":
      return beat / 2;
    default:
      return beat;
  }
}

export function snapToGrid(
  time: number,
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature = DEFAULT_TIME_SIG,
): number {
  if (grid === "free") return time;
  const gs = getGridSizeSeconds(bpm, grid, ts);
  if (gs <= 0) return time;

  if (grid === "shuffle") {
    const beat = beatDuration(bpm);
    const beatIndex = Math.floor(time / beat);
    const beatStart = beatIndex * beat;
    const eighth = beat / 2;
    const swingOffset = eighth * 0.67;
    const posInBeat = time - beatStart;
    if (posInBeat < eighth) {
      return beatStart + Math.round(posInBeat / eighth) * eighth;
    }
    return beatStart + eighth + Math.round((posInBeat - eighth) / (eighth * 0.67)) * swingOffset;
  }

  return Math.round(time / gs) * gs;
}

export function snapDuration(
  duration: number,
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature = DEFAULT_TIME_SIG,
): number {
  if (grid === "free") return Math.max(duration, 0.01);
  const gs = getGridSizeSeconds(bpm, grid, ts);
  if (gs <= 0) return Math.max(duration, 0.01);
  return Math.max(Math.round(duration / gs) * gs, gs);
}

export function snapDeltaTime(
  deltaTime: number,
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature = DEFAULT_TIME_SIG,
): number {
  if (grid === "free") return deltaTime;
  const gs = getGridSizeSeconds(bpm, grid, ts);
  if (gs <= 0) return deltaTime;
  return Math.round(deltaTime / gs) * gs;
}

export function secondsPerBar(bpm: number, ts: TimeSignature = DEFAULT_TIME_SIG): number {
  return barDuration(bpm, ts);
}

export function formatTimeSig(ts: TimeSignature): string {
  return `${ts.beatsPerBar}/${ts.beatUnit}`;
}
