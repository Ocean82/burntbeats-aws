/**
 * Backend API client. Base URL from VITE_API_BASE_URL (e.g. http://localhost:3001).
 * Attaches Clerk JWT via Authorization header on all requests.
 * Stores and forwards job_token (x-job-token) for per-job auth when JOB_TOKEN_SECRET is set on backend.
 */
import type { JobStatus, SplitQuality as SharedSplitQuality } from "@shared/types";
import { API_BASE } from "./config";
import type { StemResult } from "./types";
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
  if (parsed.detail !== undefined) {
    try { return JSON.stringify(parsed.detail); } catch { return null; }
  }
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
      const contentType = res.headers.get("content-type");
      const text = await res.text();
      let message = text || `Split failed: ${res.status}`;
      if (contentType?.includes("application/json") && text) {
        const parsed = tryParseJson(text);
        const apiError = getApiErrorMessage(parsed);
        if (apiError) message = apiError;
      }
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

  while (Date.now() - start < STATUS_POLL_MAX_MS) {
    try {
      const status = await getStemJobStatus(jobId);
      consecutive404 = 0;
      requestAnimationFrame(() => onProgress(status));
      if (status.status === "completed" || status.status === "failed") return status;
    } catch (err) {
      if (err instanceof Error && err.message === "Job not found" && consecutive404 < max404Retries) {
        consecutive404++;
      } else {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL_MS));
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
    throw new Error(t || `Status failed: ${res.status}`);
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
  throw new Error(final.error ?? "Stem separation failed");
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
    let message = text || `Expand failed: ${res.status}`;
    if (res.headers.get("content-type")?.includes("application/json") && text) {
      const parsed = tryParseJson(text);
      const apiError = getApiErrorMessage(parsed);
      if (apiError) message = apiError;
    }
    throw new Error(message);
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
  throw new Error(final.error ?? "Expand failed");
}

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
    const err = new Error(text || `Server export failed: ${res.status}`);
    // @ts-expect-error attach status for caller fallback logic
    err.status = res.status;
    throw err;
  }

  return res.blob();
}
