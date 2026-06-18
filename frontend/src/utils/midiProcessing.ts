import type { SnapGrid, TimeSignature } from "../components/midi-convert/editorTypes";
import { getGridSizeSeconds, snapToGrid, snapDuration } from "./midiEditorSnap";

export interface ProcessConfig {
  velocity?: {
    enabled: boolean;
    targetMin: number;
    targetMax: number;
  };
  filter?: {
    enabled: boolean;
    minNoteLength: number;
    maxNoteLength: number;
  };
  quantize?: {
    enabled: boolean;
    strength: number;
  };
}

export interface QualityMetrics {
  timingAccuracy: number;
  velocityConsistency: number;
  noteDensity: number;
  rhythmicComplexity: number;
  noteCount: number;
}

interface NoteLike {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export function normalizeVelocities<T extends NoteLike>(
  notes: T[],
  targetMin: number,
  targetMax: number,
): T[] {
  const velocities = notes.map((n) => n.velocity);
  const currentMin = Math.min(...velocities);
  const currentMax = Math.max(...velocities);
  if (currentMax - currentMin === 0) return notes.map((n) => ({ ...n }));

  return notes.map((n) => ({
    ...n,
    velocity: Math.round(
      targetMin +
        ((n.velocity - currentMin) / (currentMax - currentMin)) *
          (targetMax - targetMin),
    ),
  }));
}

export function filterNotesByLength<T extends NoteLike>(
  notes: T[],
  minLength: number,
  maxLength: number,
): T[] {
  return notes.filter((n) => n.duration >= minLength && n.duration <= maxLength);
}

export function quantizeWithStrength<T extends NoteLike>(
  notes: T[],
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature,
  strength: number,
): T[] {
  return notes.map((n) => {
    if (grid === "free") return n;
    const snappedStart = snapToGrid(n.start, bpm, grid, ts);
    const snappedDuration = snapDuration(n.duration, bpm, grid, ts);
    const gs = getGridSizeSeconds(bpm, grid, ts);
    const minDur = gs > 0 ? gs : 0.01;
    return {
      ...n,
      start: n.start + (snappedStart - n.start) * strength,
      duration:
        n.duration +
        (Math.max(snappedDuration, minDur) - n.duration) * strength,
    };
  });
}

export function calculateQualityMetrics<T extends NoteLike>(
  notes: T[],
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature,
): QualityMetrics {
  if (notes.length === 0) {
    return {
      timingAccuracy: 0,
      velocityConsistency: 0,
      noteDensity: 0,
      rhythmicComplexity: 0,
      noteCount: 0,
    };
  }

  const gs = getGridSizeSeconds(bpm, grid, ts);
  let alignedCount = 0;
  for (const n of notes) {
    if (gs > 0) {
      const snap = Math.round(n.start / gs) * gs;
      if (Math.abs(n.start - snap) < gs * 0.1) alignedCount++;
    }
  }
  const timingAccuracy = alignedCount / notes.length;

  const velocities = notes.map((n) => n.velocity);
  const mean =
    velocities.reduce((s, v) => s + v, 0) / velocities.length;
  const variance =
    velocities.reduce((s, v) => s + (v - mean) ** 2, 0) / velocities.length;
  const stdDev = Math.sqrt(variance);
  const velocityConsistency = Math.max(0, 1 - stdDev / 64);

  const maxEnd = notes.reduce(
    (maxT, n) => Math.max(maxT, n.start + n.duration),
    0,
  );
  const noteDensity =
    maxEnd > 0 ? notes.length / maxEnd : notes.length;

  const uniqueDurations = new Set(notes.map((n) => n.duration));
  const rhythmicComplexity = Math.min(
    1,
    (uniqueDurations.size / notes.length) * 2,
  );

  return {
    timingAccuracy,
    velocityConsistency,
    noteDensity: Math.round(noteDensity * 100) / 100,
    rhythmicComplexity: Math.round(rhythmicComplexity * 100) / 100,
    noteCount: notes.length,
  };
}

export function applyProcessing<T extends NoteLike>(
  notes: T[],
  config: ProcessConfig,
  bpm: number,
  grid: SnapGrid,
  ts: TimeSignature,
): { notes: T[]; metrics: QualityMetrics } {
  let result = notes;

  if (config.velocity?.enabled) {
    result = normalizeVelocities(result, config.velocity.targetMin, config.velocity.targetMax);
  }

  if (config.filter?.enabled) {
    result = filterNotesByLength(result, config.filter.minNoteLength, config.filter.maxNoteLength);
  }

  if (config.quantize?.enabled) {
    result = quantizeWithStrength(result, bpm, grid, ts, config.quantize.strength);
  }

  const metrics = calculateQualityMetrics(result, bpm, grid, ts);
  return { notes: result.map((n) => ({ ...n })), metrics };
}
