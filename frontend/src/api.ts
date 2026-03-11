/**
 * Backend API client. Base URL from VITE_API_BASE_URL (e.g. http://localhost:3001).
 * Fallback to 3001 so dev works if .env is missing; use 3002 if backend runs there.
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, "")
    : "http://localhost:3001");

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
  status: "running" | "completed" | "failed";
  progress: number;
  stems?: StemResult[];
  error?: string;
}

export type SplitQuality = "quality" | "speed";

const SPLIT_ACCEPT_TIMEOUT_MS = 30 * 1000; // POST returns 202 quickly
const STATUS_POLL_INTERVAL_MS = 1500;
const STATUS_POLL_MAX_MS = 16 * 60 * 1000; // stop after 16 min

/** Start stem separation; returns job_id. Separation runs in background. */
export async function startStemSplit(
  file: File,
  stems: "2" | "4",
  quality?: SplitQuality
): Promise<{ job_id: string }> {
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
      const text = await res.text();
      throw new Error(text || `Split failed: ${res.status}`);
    }

    const data = (await res.json()) as { job_id: string; status?: string };
    if (res.status === 202 && data.job_id) {
      return { job_id: data.job_id };
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
  while (Date.now() - start < STATUS_POLL_MAX_MS) {
    const status = await getStemJobStatus(jobId);
    onProgress(status);
    if (status.status === "completed" || status.status === "failed") {
      return status;
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
  return res.json() as Promise<StemJobStatus>;
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

export function getStemFileUrl(jobId: string, stemId: string): string {
  return `${API_BASE}/api/stems/file/${jobId}/${stemId}.wav`;
}
