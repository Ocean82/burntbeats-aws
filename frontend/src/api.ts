/**
 * Backend API client. Base URL from VITE_API_BASE_URL (e.g. http://localhost:3001).
 * Attaches Clerk JWT via Authorization header on all requests.
 * Stores and forwards job_token (x-job-token) for per-job auth when JOB_TOKEN_SECRET is set on backend.
 */
import type { JobStatus, SplitQuality as SharedSplitQuality } from "@shared/types";
import { API_BASE, MAX_UPLOAD_BYTES } from "./config";
import type { StemResult } from "./types";
import { userFacingApiError, userFacingHttpError } from "./userFacingError";
import type { StemEditorState } from "./stem-editor-state";

// Token provider injected at app startup by ClerkProvider — avoids importing Clerk hooks here.
let _getToken: (() => Promise<string | null>) | null = null;
export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  const token = await _getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// Per-job token store: job_id → job_token (short-lived, issued by backend on split/expand)
const jobTokenStore = new Map<string, string>();

function getJobToken(jobId: string): string | undefined {
  return jobTokenStore.get(jobId);
}

function setJobToken(jobId: string, token: string) {
  jobTokenStore.set(jobId, token);
}

export function clearJobToken(jobId: string) {
  jobTokenStore.delete(jobId);
}

function jobTokenHeader(jobId: string): Record<string, string> {
  const t = getJobToken(jobId);
  return t ? { "x-job-token": t } : {};
}

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
  const res = await fetch(pathUrl, {
    headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading stem`);
  return res.blob();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getApiErrorMessage(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.error === "string") return parsed.error;
  if (typeof parsed.detail === "string") return parsed.detail;
  return null;
}

function isJobStatusValue(value: unknown): value is JobStatus {
  return value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

function isStemResultValue(value: unknown): value is StemResult {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.url !== "string") return false;
  if (value.path !== undefined && typeof value.path !== "string") return false;
  return true;
}

function isStemJobStatusValue(value: unknown): value is StemJobStatus {
  if (!isRecord(value)) return false;
  if (!isJobStatusValue(value.status)) return false;
  if (typeof value.progress !== "number" || !Number.isFinite(value.progress)) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.stems !== undefined) {
    if (!Array.isArray(value.stems)) return false;
    if (!value.stems.every(isStemResultValue)) return false;
  }
  return true;
}

function isAcceptedJobIdResponse(value: unknown): value is { job_id: string; status?: string; job_token?: string } {
  if (!isRecord(value)) return false;
  if (typeof value.job_id !== "string" || value.job_id.length === 0) return false;
  if (value.status !== undefined && typeof value.status !== "string") return false;
  return true;
}

export interface SplitResponse {
  job_id: string;
  status: string;
  stems: StemResult[];
}

export interface StemJobStatus {
  status: JobStatus;
  progress: number;
  stems?: StemResult[];
  error?: string;
}

export type SplitQuality = SharedSplitQuality;

const SPLIT_ACCEPT_TIMEOUT_MS = Number(import.meta.env.VITE_SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;
const STATUS_POLL_INTERVAL_MS = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 1500;
const STATUS_POLL_MAX_MS = Number(import.meta.env.VITE_STATUS_POLL_MAX_MS) || 16 * 60 * 1000;

/** Start stem separation; returns job_id. Separation runs in background. */
export async function startStemSplit(
  file: File,
  stems: "2" | "4",
  quality?: SplitQuality
): Promise<{ job_id: string }> {
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error("No file provided. Upload an audio file first.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    throw new Error(`File too large. Maximum size is ${mb}MB.`);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("stems", stems);
  if (quality) form.append("quality", quality);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SPLIT_ACCEPT_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/stems/split`, {
      method: "POST",
      body: form,
      headers: await authHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      const contentType = res.headers.get("content-type") || "";
      let bodyError: string | null = null;
      if (contentType.includes("application/json") && text) {
        bodyError = getApiErrorMessage(tryParseJson(text));
      }
      const message = userFacingHttpError(
        res.status,
        bodyError,
        text.slice(0, 800) || `Split failed: ${res.status}`,
      );
      throw new Error(message);
    }

    const json: unknown = await res.json();
    if (res.status === 202 && isAcceptedJobIdResponse(json)) {
      // Store job_token if backend issued one (requires JOB_TOKEN_SECRET to be set)
      if (typeof json.job_token === "string" && json.job_token) {
        setJobToken(json.job_id, json.job_token);
      }
      return { job_id: json.job_id };
    }
    throw new Error("Unexpected response from split");
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === "AbortError") throw new Error("Stem service did not accept in time. Try again.");
      throw err;
    }
    throw new Error("Stem split request failed");
  }
}

/** Poll job status until completed or failed; returns final status. */
export async function pollStemJobUntilDone(
  jobId: string,
  onProgress: (status: StemJobStatus) => void
): Promise<StemJobStatus> {
  const start = Date.now();
  let consecutive404 = 0;
  const max404Retries = 5;
  let backoffMs = STATUS_POLL_INTERVAL_MS;
  const maxBackoffMs = 10000;

  while (Date.now() - start < STATUS_POLL_MAX_MS) {
    try {
      const status = await getStemJobStatus(jobId);
      consecutive404 = 0;
      backoffMs = STATUS_POLL_INTERVAL_MS;
      requestAnimationFrame(() => onProgress(status));
      if (status.status === "completed" || status.status === "failed") return status;
    } catch (err) {
      if (err instanceof Error && err.message === "Job not found" && consecutive404 < max404Retries) {
        consecutive404++;
      } else {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * 1.5, maxBackoffMs);
  }
  throw new Error("Stem separation timed out.");
}

export async function getStemJobStatus(jobId: string): Promise<StemJobStatus> {
  const res = await fetch(`${API_BASE}/api/stems/status/${jobId}`, {
    headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Job not found");
    const t = await res.text();
    const ct = res.headers.get("content-type") || "";
    let bodyError: string | null = null;
    if (ct.includes("application/json") && t) {
      bodyError = getApiErrorMessage(tryParseJson(t));
    }
    throw new Error(
      userFacingHttpError(res.status, bodyError, t.slice(0, 800) || `Status failed: ${res.status}`),
    );
  }
  const json: unknown = await res.json();
  if (!isStemJobStatusValue(json)) throw new Error("Unexpected response from status");
  return json;
}

/** Start split and poll until done; calls onProgress with each status. Returns final stems on success. */
export async function splitStems(
  file: File,
  stems: "2" | "4",
  quality?: SplitQuality,
  onProgress?: (status: StemJobStatus) => void
): Promise<SplitResponse> {
  const { job_id } = await startStemSplit(file, stems, quality);
  const final = await pollStemJobUntilDone(job_id, (s) => onProgress?.(s));
  if (final.status === "completed" && final.stems) {
    return { job_id, status: "completed", stems: final.stems };
  }
  throw new Error(userFacingApiError(final.error ?? null, "Stem separation failed"));
}

/** Start expand (2-stem → 4-stem). Returns new job_id. Poll status until completed. */
export async function startExpand(
  jobId: string,
  quality?: SplitQuality
): Promise<{ job_id: string }> {
  const body = JSON.stringify({ job_id: jobId, quality: quality ?? "quality" });
  const res = await fetch(`${API_BASE}/api/stems/expand`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...jobTokenHeader(jobId),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    const ct = res.headers.get("content-type") || "";
    let bodyError: string | null = null;
    if (ct.includes("application/json") && text) {
      bodyError = getApiErrorMessage(tryParseJson(text));
    }
    throw new Error(
      userFacingHttpError(res.status, bodyError, text.slice(0, 800) || `Expand failed: ${res.status}`),
    );
  }
  const json: unknown = await res.json();
  if (res.status === 202 && isAcceptedJobIdResponse(json)) {
    if (typeof json.job_token === "string" && json.job_token) {
      setJobToken(json.job_id, json.job_token);
    }
    return { job_id: json.job_id };
  }
  throw new Error("Unexpected response from expand");
}

/** Expand 2-stem job to 4 stems and poll until done. Returns final stems. */
export async function expandStems(
  jobId: string,
  quality?: SplitQuality,
  onProgress?: (status: StemJobStatus) => void
): Promise<SplitResponse> {
  const { job_id } = await startExpand(jobId, quality);
  const final = await pollStemJobUntilDone(job_id, (s) => onProgress?.(s));
  if (final.status === "completed" && final.stems) {
    return { job_id, status: "completed", stems: final.stems };
  }
  throw new Error(userFacingApiError(final.error ?? null, "Expand failed"));
}

/** Public stem file path (no auth); callers must load audio via {@link fetchStemWavAsArrayBuffer} or {@link fetchStemWavAsBlob}. */
export function getStemFileUrl(jobId: string, stemId: string): string {
  return `${API_BASE}/api/stems/file/${jobId}/${stemId}.wav`;
}

export interface ServerExportMasterRequest {
  job_id: string;
  stem_ids: string[];
  stem_states: Record<string, StemEditorState>;
  upload_name: string;
  normalize: boolean;
}

/**
 * Server-side master export. Returns a WAV Blob.
 * If server export is disabled, backend returns 404; callers can fall back to client export.
 */
export async function serverExportMasterWav(request: ServerExportMasterRequest): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/stems/server-export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const ct = res.headers.get("content-type") || "";
    let bodyError: string | null = null;
    if (ct.includes("application/json") && text) {
      bodyError = getApiErrorMessage(tryParseJson(text));
    }
    const msg = userFacingHttpError(
      res.status,
      bodyError,
      text.slice(0, 800) || `Server export failed: ${res.status}`,
    );
    const err = new Error(msg);
    // @ts-expect-error attach status for caller fallback logic
    err.status = res.status;
    throw err;
  }

  return res.blob();
}
