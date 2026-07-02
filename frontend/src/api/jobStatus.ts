/**
 * Job status polling and SSE streaming for stem separation jobs.
 *
 * Uses fetchWithRetry for transient failure resilience (502/503/504 + network errors).
 * Polling pauses automatically when the browser goes offline and resumes on reconnection.
 */
import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";
import { tryParseJson, getApiErrorMessage, isStemJobStatusValue } from "./validation";
import { userFacingHttpError } from "../userFacingError";
import { fetchWithRetry } from "./retry";
import type { StemJobStatus } from "./types";

const STATUS_POLL_INTERVAL_MS = Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 1500;
// Separation can legitimately exceed 16 minutes on CPU-heavy jobs; keep polling longer
// so users get eventual completion instead of a false timeout.
const STATUS_POLL_MAX_MS = Number(import.meta.env.VITE_STATUS_POLL_MAX_MS) || 30 * 60 * 1000;

/** Wait until the browser reports online status. Resolves immediately if already online. */
function waitForOnline(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener("online", handler);
      resolve();
    };
    window.addEventListener("online", handler);
  });
}

export async function getStemJobStatus(jobId: string): Promise<StemJobStatus> {
  // Pause if offline — don't burn through retries while disconnected
  await waitForOnline();

  const res = await fetchWithRetry(
    `${API_BASE}/api/stems/status/${jobId}`,
    { headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) } },
    { maxAttempts: 3, baseDelay: 1000, retryOn: [502, 503, 504] },
  );
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
  onProgress: (status: StemJobStatus) => void,
  onRetry?: () => void,
): Promise<StemJobStatus> {
  const start = Date.now();
  let consecutive404 = 0;
  const max404Retries = 5;
  let backoffMs = STATUS_POLL_INTERVAL_MS;
  const maxBackoffMs = 10000;

  while (Date.now() - start < STATUS_POLL_MAX_MS) {
    // Pause polling while offline — don't count offline time toward timeout
    await waitForOnline();

    try {
      const status = await getStemJobStatusWithRetryHint(jobId, onRetry);
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
 * Uses fetchWithRetry for the initial connection so Authorization and x-job-token headers are sent.
 * Waits for online status before attempting the connection.
 */
export async function streamStemJobUntilDone(
  jobId: string,
  onProgress: (status: StemJobStatus) => void,
  onRetry?: () => void,
): Promise<StemJobStatus> {
  // Don't attempt SSE while offline
  await waitForOnline();

  const url = `${API_BASE}/api/stems/status/${jobId}/stream`;
  const headers: Record<string, string> = {
    ...(await authHeaders()),
    ...jobTokenHeader(jobId),
    Accept: "text/event-stream",
  };

  let response: Response;
  try {
    response = await fetchWithRetry(
      url,
      { headers },
      { maxAttempts: 2, baseDelay: 500, retryOn: [502, 503, 504] },
    );
  } catch {
    // Network error — fall back to polling
    onRetry?.();
    return pollStemJobUntilDone(jobId, onProgress, onRetry);
  }

  if (!response.ok || !response.body) {
    // SSE endpoint unavailable (e.g. older backend) — fall back to polling
    onRetry?.();
    return pollStemJobUntilDone(jobId, onProgress, onRetry);
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
    onRetry?.();
    return pollStemJobUntilDone(jobId, onProgress, onRetry);
  }

  reader.cancel().catch(() => {});
  throw new Error("Stem separation timed out.");
}

async function getStemJobStatusWithRetryHint(
  jobId: string,
  onRetry?: () => void,
): Promise<StemJobStatus> {
  await waitForOnline();
  const res = await fetchWithRetry(
    `${API_BASE}/api/stems/status/${jobId}`,
    { headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) } },
    {
      maxAttempts: 3,
      baseDelay: 1000,
      retryOn: [502, 503, 504],
      onRetry: () => onRetry?.(),
    },
  );
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
