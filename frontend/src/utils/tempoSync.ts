/**
 * Musical timing helpers (aligned with Tone.js time notation).
 * Used by the stem DSP delay when beat-grid BPM is available.
 */

export const DEFAULT_PLAYBACK_BPM = 120;

export type TempoNoteDivision =
  | "1m"
  | "2m"
  | "4n"
  | "8n"
  | "16n"
  | "8t"
  | "4n."
  | "8n.";

/**
 * Duration of one note division in seconds at the given BPM.
 * Dotted notes multiply base duration by 1.5; triplets by 2/3.
 */
export function noteDurationSeconds(
  bpm: number,
  division: TempoNoteDivision = "8n",
): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    bpm = DEFAULT_PLAYBACK_BPM;
  }
  const quarterSec = 60 / bpm;
  let base: number;
  switch (division) {
    case "1m":
      base = quarterSec * 4;
      break;
    case "2m":
      base = quarterSec * 8;
      break;
    case "4n":
      base = quarterSec;
      break;
    case "8n":
      base = quarterSec / 2;
      break;
    case "16n":
      base = quarterSec / 4;
      break;
    case "8t":
      base = (quarterSec / 2) * (2 / 3);
      break;
    case "4n.":
      base = quarterSec * 1.5;
      break;
    case "8n.":
      base = (quarterSec / 2) * 1.5;
      break;
    default:
      base = quarterSec / 2;
  }
  return base;
}

export function resolvePlaybackBpm(
  bpm: number | null | undefined,
  minBpm = 40,
  maxBpm = 300,
): number {
  if (!Number.isFinite(bpm) || !bpm || bpm <= 0) {
    return DEFAULT_PLAYBACK_BPM;
  }
  return Math.min(maxBpm, Math.max(minBpm, bpm));
}
