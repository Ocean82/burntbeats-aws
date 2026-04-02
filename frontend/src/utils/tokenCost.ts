/**
 * Mirrors backend `usageTokens.computeTokensFromDurationSeconds`:
 * 1 token per started minute, partial minutes round up, minimum 1 per job.
 */
export function computeTokensFromDurationSeconds(durationSec: number | null | undefined): number | null {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  const d = Math.max(0, durationSec);
  return Math.max(1, Math.ceil(d / 60));
}
