/**
 * Backend API client. Base URL from VITE_API_BASE_URL (e.g. http://localhost:3001).
 * Fallback to 3001 so dev works if .env is missing; use 3002 if backend runs there.
 */
import type { JobStatus, SplitQuality as SharedSplitQuality } from "../../shared/types";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : (typeof window !== "undefined" && window.location.hostname !== "localhost" ? window.location.origin : "http://localhost:3001"));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tryParseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function getApiErrorMessage(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.error === "string") return parsed.error;
  if (typeof parsed.detail === "string") return parsed.detail;
  if (parsed.detail !== undefined) {
    try {
      return JSON.stringify(parsed.detail);
    } catch {
      return null;
    }
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

function isAcceptedJobIdResponse(value: unknown): value is { job_id: string; status?: string } {
  if (!isRecord(value)) return false;
  if (typeof value.job_id !== "string" || value.job_id.length === 0) return false;
  if (value.status !== undefined && typeof value.status !== "string") return false;
  return true;
}

export interface StemResult {
  id: string;
  url: string;
  path?: string;
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

const SPLIT_ACCEPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout for large files
const STATUS_POLL_INTERVAL_MS = 1500;
const STATUS_POLL_MAX_MS = 16 * 60 * 1000; // stop after 16 min

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
      return { job_id: json.job_id };
    }
    throw new Error("Unexpected response from split");
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error("Stem service did not accept in time. Try again.");
      }
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
      // Defer React state update so this handler returns quickly (avoids "message handler took Nms" violation)
      requestAnimationFrame(() => onProgress(status));
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
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
  const res = await fetch(`${API_BASE}/api/stems/status/${jobId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Job not found");
    const t = await res.text();
    throw new Error(t || `Status failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  if (!isStemJobStatusValue(json)) {
    throw new Error("Unexpected response from status");
  }
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
    headers: { "Content-Type": "application/json" },
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
  if (res.status === 202 && isAcceptedJobIdResponse(json)) return { job_id: json.job_id };
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
