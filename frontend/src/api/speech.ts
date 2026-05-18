import { API_BASE, MAX_UPLOAD_BYTES } from "../config";
import { authHeaders, setJobToken, jobTokenHeader } from "./auth";
import { tryParseJson, getApiErrorMessage, isAcceptedJobIdResponse } from "./validation";
import { userFacingApiError, userFacingHttpError } from "../userFacingError";
import { uploadWithProgress, type UploadProgressEvent } from "../utils/uploadWithProgress";
import { pollSpeechJobUntilDone } from "./speechJobStatus";
import type { SpeechEnhanceResponse, SpeechJobStatus } from "./speechTypes";

const ACCEPT_TIMEOUT_MS =
  Number(import.meta.env.VITE_SPEECH_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

export async function startSpeechEnhance(
  file: File,
  options: { denoise?: boolean; batch?: boolean },
  onUploadProgress?: (event: UploadProgressEvent) => void,
): Promise<SpeechEnhanceResponse> {
  if (!file?.size) throw new Error("No file provided. Upload a speech recording first.");
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    throw new Error(`File too large. Maximum size is ${mb}MB.`);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("denoise", options.denoise !== false ? "true" : "false");
  form.append("batch", options.batch ? "true" : "false");

  const result = await uploadWithProgress({
    url: `${API_BASE}/api/speech/enhance`,
    formData: form,
    headers: await authHeaders(),
    onProgress: onUploadProgress,
    timeoutMs: ACCEPT_TIMEOUT_MS,
  });

  if (result.status < 200 || result.status >= 300) {
    const ct = result.headers["content-type"] || "";
    let bodyError: string | null = null;
    if (ct.includes("application/json") && result.body) {
      bodyError = getApiErrorMessage(tryParseJson(result.body));
    }
    throw new Error(
      userFacingHttpError(
        result.status,
        bodyError,
        result.body.slice(0, 800) || `Enhance failed: ${result.status}`,
      ),
    );
  }

  const json: unknown = tryParseJson(result.body);
  if (result.status === 202 && isAcceptedJobIdResponse(json)) {
    if (typeof json.job_token === "string" && json.job_token) {
      setJobToken(json.job_id, json.job_token);
    }
    return {
      job_id: json.job_id,
      status: typeof json.status === "string" ? json.status : "queued",
      output_url:
        isRecord(json) && typeof json.output_url === "string" ? json.output_url : undefined,
      status_url:
        isRecord(json) && typeof json.status_url === "string" ? json.status_url : undefined,
    };
  }
  throw new Error("Unexpected response from speech enhance");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function enhanceSpeech(
  file: File,
  options: { denoise?: boolean; batch?: boolean },
  onProgress?: (status: SpeechJobStatus) => void,
  onUploadProgress?: (event: UploadProgressEvent) => void,
): Promise<{ job_id: string; output_url: string }> {
  const started = await startSpeechEnhance(file, options, onUploadProgress);
  const final = await pollSpeechJobUntilDone(started.job_id, (s) => onProgress?.(s));
  if (final.status === "completed") {
    const outputUrl =
      final.output_url ||
      started.output_url ||
      `${API_BASE}/api/speech/file/${started.job_id}/enhanced.wav`;
    return { job_id: started.job_id, output_url: outputUrl };
  }
  throw new Error(userFacingApiError(final.error ?? null, "Speech enhancement failed"));
}

const SPEECH_FILE_JOB_RE =
  /\/api\/speech\/file\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

export function parseJobIdFromSpeechFileUrl(url: string): string | null {
  const m = url.match(SPEECH_FILE_JOB_RE);
  return m ? m[1] : null;
}

export async function fetchSpeechWavAsBlob(outputUrl: string): Promise<Blob> {
  const jobId = parseJobIdFromSpeechFileUrl(outputUrl);
  if (!jobId) throw new Error("Invalid speech output URL");
  const pathUrl = outputUrl.split("?")[0];
  const res = await fetch(pathUrl, {
    headers: { ...(await authHeaders()), ...jobTokenHeader(jobId) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading enhanced audio`);
  return res.blob();
}
