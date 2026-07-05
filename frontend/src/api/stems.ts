/**
 * Stem file operations: URL construction, fetching stem audio data.
 */
import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";

/** Match `/api/stems/file/{uuid}/` in absolute or same-origin-relative URLs. */
const STEM_FILE_JOB_ID_RE = /\/api\/stems\/file\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

/**
 * Stem WAV fetch URL: avoid mixed content when the API returns `http://` behind TLS termination.
 * - Production: same hostname as the SPA → use a path-only URL so fetch uses the page origin (always HTTPS on https://).
 * - Local dev: API is often another port (e.g. 3001 vs Vite 5173) → keep absolute URL; upgrade http→https only when same host.
 */
function coerceStemFileUrlForFetch(stemUrl: string): string {
  if (typeof window === "undefined") return stemUrl;
  const locHost = window.location.hostname;
  const isLocal =
    locHost === "localhost" || locHost === "127.0.0.1" || locHost === "[::1]";
  try {
    const u = new URL(stemUrl, window.location.origin);
    if (isLocal) {
      if (window.location.protocol === "https:" && u.protocol === "http:" && u.hostname === locHost) {
        u.protocol = "https:";
        return u.toString();
      }
      return stemUrl;
    }
    const stripWww = (h: string) => h.replace(/^www\./i, "");
    if (stripWww(u.hostname) === stripWww(locHost)) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* ignore */
  }
  return stemUrl;
}

/** Extract job UUID from a stem file URL returned by the API. */
export function parseJobIdFromStemFileUrl(stemUrl: string): string | null {
  const m = stemUrl.match(STEM_FILE_JOB_ID_RE);
  return m ? m[1] : null;
}

/**
 * Fetch a stem WAV using Authorization + x-job-token headers (never relies on ?token= in the URL).
 */
export async function fetchStemWavAsArrayBuffer(stemUrl: string): Promise<ArrayBuffer> {
  const coerced = coerceStemFileUrlForFetch(stemUrl);
  const jobId = parseJobIdFromStemFileUrl(coerced);
  if (!jobId) throw new Error("Invalid stem file URL");
  const pathUrl = coerced.split("?")[0];
  // binary download — intentional bypass of api/client (arrayBuffer response)
  const res = await fetch(pathUrl, {
    headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading stem`);
  return res.arrayBuffer();
}

/** Same as {@link fetchStemWavAsArrayBuffer} but returns a Blob (e.g. downloads). */
export async function fetchStemWavAsBlob(stemUrl: string): Promise<Blob> {
  const coerced = coerceStemFileUrlForFetch(stemUrl);
  const jobId = parseJobIdFromStemFileUrl(coerced);
  if (!jobId) throw new Error("Invalid stem file URL");
  const pathUrl = coerced.split("?")[0];
  // binary download — intentional bypass of api/client (arrayBuffer response)
  const res = await fetch(pathUrl, {
    headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading stem`);
  return res.blob();
}

/** Public stem file path (no auth); callers must load audio via {@link fetchStemWavAsArrayBuffer} or {@link fetchStemWavAsBlob}. */
export function getStemFileUrl(jobId: string, stemId: string): string {
  return `${API_BASE}/api/stems/file/${jobId}/${stemId}.wav`;
}
