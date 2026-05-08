// @ts-check
/**
 * Token cost computation — pure functions, no I/O.
 *
 * 1 token = 1 minute of audio (partial minutes round up).
 * Example: 5:00 → 5 tokens, 3:01 → 4 tokens.
 */

/**
 * Check if sample mode is enabled.
 * Sample mode allows free 30-60 second splits without consuming tokens.
 * @returns {boolean}
 */
export function isSampleModeEnabled() {
  return ["1", "true", "yes"].includes(
    (process.env.SAMPLE_MODE_ENABLED || "").toLowerCase(),
  );
}

/**
 * Tokens from duration: one token per started minute (ceil), minimum 1 token per job.
 * @param {number} durationSec
 */
export function computeTokensFromDurationSeconds(durationSec) {
  const d = Math.max(0, durationSec);
  return Math.max(1, Math.ceil(d / 60));
}

/**
 * @param {number} durationSec
 * @param {string|undefined} _quality
 * @param {string|undefined} _stems
 * @param {boolean} [isSample]
 */
export function computeSplitCost(durationSec, _quality, _stems, isSample) {
  if (isSample && isSampleModeEnabled() && durationSec <= 60) {
    return 0;
  }
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * @param {number} durationSec
 * @param {string|undefined} _quality
 */
export function computeExpandCost(durationSec, _quality) {
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * **`POST /api/stems/server-export`** — offline render cost.
 * Same minute basis as split/expand (`computeTokensFromDurationSeconds`).
 * @param {number} durationSec
 */
export function computeServerExportCost(durationSec) {
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * Calculate token cost for sample mode.
 * Always returns 0 tokens for durations up to 60 seconds.
 * @param {number} durationSec
 * @returns {number}
 */
export function calculateSampleModeCost(durationSec) {
  if (isSampleModeEnabled() && durationSec <= 60) {
    return 0;
  }
  return Math.max(1, Math.ceil(durationSec / 60));
}
