// @ts-check

/** @typedef {"speed" | "quality"} CanonicalStemQuality */

export const STEM_QUALITY_ERROR =
  "quality must be 'speed', 'balanced', 'quality', or 'ultra'";

const ACCEPTED_STEM_QUALITIES = new Set([
  "speed",
  "balanced",
  "quality",
  "ultra",
]);

/**
 * Normalize legacy and canonical stem quality values for proxy, entitlements, and DB.
 * @param {unknown} raw
 * @returns {{ ok: true; quality: CanonicalStemQuality | undefined } | { ok: false; error: string }}
 */
export function normalizeStemQuality(raw) {
  if (raw == null || raw === "") {
    return { ok: true, quality: undefined };
  }
  const value = String(raw).trim().toLowerCase();
  if (!ACCEPTED_STEM_QUALITIES.has(value)) {
    return { ok: false, error: STEM_QUALITY_ERROR };
  }
  if (value === "balanced" || value === "ultra") {
    return { ok: true, quality: "quality" };
  }
  return { ok: true, quality: /** @type {CanonicalStemQuality} */ (value) };
}
