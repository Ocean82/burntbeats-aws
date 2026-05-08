/**
 * Job status polling and SSE streaming for stem separation jobs.
 */
import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";
import { tryParseJson, getApiErrorMessage, isStemJobStatusValue } from "./validation";
import { userFacingHttpError } from "../userFacingError";
import type { StemJobStatus } from "./types";

const STATUS_POLL_INTERVAL_MS = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 1500;
// Separation can legitimately exceed 16 minutes on CPU-heavy jobs; keep polling longer
// so users get eventual completion instead of a false timeout.
const STATUS_POLL_MAX_MS = Number(import.meta.env.VITE_STATUS_POLL_MAX_MS) || 30 * 60 * 1000;

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

/**
 * Stream job progress via SSE (fetch + ReadableStream) until completed or failed.
 * Falls back to polling if the stream cannot be established or encounters an error.
 *
 * Uses fetch instead of EventSource so Authorization and x-job-token headers are sent.
 */
export async function streamStemJobUntilDone(
  jobId: string,
  onProgress: (status: StemJobStatus) => void
): Promise<StemJobStatus> {
  const url = `${API_BASE}/api/stems/status/${jobId}/stream`;
  const headers: Record<string, string> = {
    ...(await authHeaders()),
    ...jobTokenHeader(jobId),
    Accept: "text/event-stream",
  };

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    // Network error — fall back to polling
    return pollStemJobUntilDone(jobId, onProgress);
  }

  if (!response.ok || !response.body) {
    // SSE endpoint unavailable (e.g. older backend) — fall back to polling
    return pollStemJobUntilDone(jobId, onProgress);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const start = Date.now();

  try {
    while (Date.now() - start < STATUS_POLL_MAX_MS) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines; each frame is "data: <json>\n"
      const frames = buffer.split("\n\n");
      // Keep the last (potentially incomplete) frame in the buffer
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice("data: ".length);
        let status: StemJobStatus;
        try {
          const parsed: unknown = JSON.parse(jsonStr);
          if (!isStemJobStatusValue(parsed)) continue;
          status = parsed;
        } catch {
          continue;
        }
        requestAnimationFrame(() => onProgress(status));
        if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
          reader.cancel().catch(() => {});
          return status;
        }
      }
    }
  } catch {
    // Stream error — fall back to polling for the remainder
    reader.cancel().catch(() => {});
    return pollStemJobUntilDone(jobId, onProgress);
  }

  reader.cancel().catch(() => {});
  throw new Error("Stem separation timed out.");
}
