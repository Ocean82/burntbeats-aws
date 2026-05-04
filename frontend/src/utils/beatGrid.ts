export interface BeatGridMetadata {
  bpm: number;
  beat_offset_seconds: number;
  confidence: number;
}

export interface BeatGridComputeOptions {
  beatGrid: BeatGridMetadata;
  maxDuration: number;
  scrollPct: number;
  zoom: number;
}

export const BEAT_GRID_MIN_CONFIDENCE = 0.3;

export function shouldRenderBeatGrid(
  beatGrid: BeatGridMetadata | null | undefined,
  minConfidence = BEAT_GRID_MIN_CONFIDENCE,
): boolean {
  if (!beatGrid) return false;
  if (!Number.isFinite(beatGrid.bpm) || beatGrid.bpm <= 0) return false;
  if (!Number.isFinite(beatGrid.confidence)) return false;
  return beatGrid.confidence >= minConfidence;
}

/**
 * Compute beat-grid positions as percentages (0–100) within the current visible viewport.
 * Returns an empty array if beat grid is unavailable, duration is zero, or no beats fall in view.
 */
export function computeBeatGridPcts({
  beatGrid,
  maxDuration,
  scrollPct,
  zoom,
}: BeatGridComputeOptions): number[] {
  if (maxDuration <= 0 || zoom <= 0 || beatGrid.bpm <= 0) return [];

  const beatInterval = 60 / beatGrid.bpm;
  const visStart = scrollPct / 100;
  const visEnd = Math.min(1, visStart + 1 / zoom);
  const startTime = visStart * maxDuration;
  const endTime = visEnd * maxDuration;

  const firstBeatIndex = Math.floor(
    (startTime - beatGrid.beat_offset_seconds) / beatInterval,
  );
  const lastBeatIndex = Math.ceil(
    (endTime - beatGrid.beat_offset_seconds) / beatInterval,
  );

  const pcts: number[] = [];
  for (let i = firstBeatIndex; i <= lastBeatIndex; i++) {
    const beatTime = beatGrid.beat_offset_seconds + i * beatInterval;
    if (beatTime < startTime || beatTime > endTime) continue;
    const pct = ((beatTime - startTime) / (endTime - startTime)) * 100;
    if (pct >= 0 && pct <= 100) pcts.push(pct);
  }
  return pcts;
}

/**
 * Decay a peak-hold pixel value by a fixed amount per frame.
 * Returns the new peak position in pixels.
 */
export function decayPeak(currentPeakPx: number, decayPerFrame: number): number {
  return Math.max(0, currentPeakPx - decayPerFrame);
}
