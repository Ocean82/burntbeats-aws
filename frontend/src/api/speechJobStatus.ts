import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";
import { tryParseJson, getApiErrorMessage } from "./validation";
import { isSpeechJobStatusValue } from "./speechValidation";
import { userFacingHttpError } from "../userFacingError";
import type { SpeechJobStatus } from "./speechTypes";

const POLL_INTERVAL_MS =
  Number(import.meta.env.VITE_STATUS_POLL_INTERVAL_MS) || 1500;
const POLL_MAX_MS = Number(import.meta.env.VITE_STATUS_POLL_MAX_MS) || 10 * 60 * 1000;

export async function getSpeechJobStatus(jobId: string): Promise<SpeechJobStatus> {
  const res = await fetch(`${API_BASE}/api/speech/status/${jobId}`, {
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
  if (!isSpeechJobStatusValue(json)) throw new Error("Unexpected response from speech status");
  return json;
}

export async function pollSpeechJobUntilDone(
  jobId: string,
  onProgress: (status: SpeechJobStatus) => void,
): Promise<SpeechJobStatus> {
  const start = Date.now();
  let backoffMs = POLL_INTERVAL_MS;

  while (Date.now() - start < POLL_MAX_MS) {
    const status = await getSpeechJobStatus(jobId);
    requestAnimationFrame(() => onProgress(status));
    if (status.status === "completed" || status.status === "failed") return status;
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * 1.25, 8000);
  }
  throw new Error("Speech enhancement timed out.");
}
