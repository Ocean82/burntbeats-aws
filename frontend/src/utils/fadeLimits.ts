/** Max fade in/out seconds for a clip; UI and playback share this cap. */
export function getMaxFadeSeconds(stemDurationSec: number): number {
  if (stemDurationSec <= 0) return 5;
  return Math.min(30, Math.max(5, stemDurationSec * 0.25));
}
