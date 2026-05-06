// @ts-check

/** Path traversal hardening: allowlist only (Python uses UUID4 for job_id; stem ids are fixed set) */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALLOWED_STEM_IDS = new Set([
  "vocals",
  "drums",
  "bass",
  "other",
  "instrumental",
]);

/**
 * @param {string} jobId
 * @param {string} stemIdParam
 * @returns {{ ok: boolean, stemId: string | null }}
 */
export function validateStemFileParams(jobId, stemIdParam) {
  if (!jobId || !UUID_REGEX.test(jobId)) return { ok: false, stemId: null };
  const raw = stemIdParam.replace(/\.wav$/i, "");
  if (!raw || !ALLOWED_STEM_IDS.has(raw)) return { ok: false, stemId: null };
  return { ok: true, stemId: `${raw}.wav` };
}
