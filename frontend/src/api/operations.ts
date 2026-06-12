/**
 * High-level stem operations: split, expand, server-export.
 */
import { API_BASE, MAX_UPLOAD_BYTES } from "../config";
import { authHeaders, setJobToken, jobTokenHeader } from "./auth";
import { tryParseJson, getApiErrorMessage, isAcceptedJobIdResponse } from "./validation";
import { userFacingApiError, userFacingHttpError } from "../userFacingError";
import { streamStemJobUntilDone } from "./jobStatus";
import { uploadWithProgress, type UploadProgressEvent } from "../utils/uploadWithProgress";
import { apiPost } from "./client";
import { fetchWithRetry } from "./retry";
import type { SplitIntent } from "@shared/types";
import type { SplitResponse, SplitQuality, StemJobStatus, ServerExportMasterRequest } from "./types";
import { withIntentQuality } from "../utils/splitIntent";

const SPLIT_ACCEPT_TIMEOUT_MS = Number(import.meta.env.VITE_SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

/** Get presigned S3 upload URL. */
export async function getUploadUrl(filename: string, contentType: string): Promise<{ upload_url: string; s3_key: string; job_id: string }> {
  const result = await apiPost<{ upload_url: string; s3_key: string; job_id: string }>(
    "/api/stems/upload-url",
    { filename, contentType },
    { retry: { maxAttempts: 2, retryOn: [502, 503, 504] } },
  );
  if (result.error || !result.data) {
    throw new Error(result.error || `Failed to get upload URL: ${result.status}`);
  }
  return result.data;
}

/** Start stem separation; returns job_id. Separation runs in background. */
export async function startStemSplit(
  file: File,
  stems: "2" | "4",
  quality?: SplitQuality,
  isSample?: boolean,
  onUploadProgress?: (event: UploadProgressEvent) => void,
  intent?: SplitIntent,
): Promise<{ job_id: string }> {
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error("No file provided. Upload an audio file first.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    throw new Error(`File too large. Maximum size is ${mb}MB.`);
  }

  // ── Optimization: S3 Direct Upload ──────────────────────────────────────────
  // If enabled, we upload to S3 first, then notify the backend.
  // This offloads heavy binary transfer from the API server.
  const useS3Direct = import.meta.env.VITE_USE_S3_DIRECT_UPLOAD === "true";

  if (useS3Direct && !isSample) {
    try {
      const { upload_url, s3_key } = await getUploadUrl(file.name, file.type);
      
      // Perform direct PUT to S3
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      
      if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

      // Notify backend to start processing
      const res = await fetch(`${API_BASE}/api/stems/split`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          s3_key,
          filename: file.name,
          stems,
          quality,
          intent: intent ? (quality ? withIntentQuality(intent, quality) : intent) : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Processing request failed: ${res.status} ${text}`);
      }

      const json = await res.json();
      if (typeof json.job_token === "string" && json.job_token) {
        setJobToken(json.job_id, json.job_token);
      }
      return { job_id: json.job_id };
    } catch (err) {
      console.warn("[split] S3 direct upload failed, falling back to proxy:", err);
      // Fall through to original multipart proxy flow
    }
  }

  const form = new FormData();
// ...
  form.append("file", file);
  form.append("stems", stems);
  if (quality) form.append("quality", quality);
  if (intent) {
    const payload = quality
      ? withIntentQuality(intent, quality)
      : intent;
    form.append("intent", JSON.stringify(payload));
  }
  if (isSample) form.append("sample", "true");

  const controller = new AbortController();

  try {
    const result = await uploadWithProgress({
      url: `${API_BASE}/api/stems/split`,
      formData: form,
      headers: await authHeaders(),
      onProgress: onUploadProgress,
      signal: controller.signal,
      timeoutMs: SPLIT_ACCEPT_TIMEOUT_MS,
    });

    if (result.status < 200 || result.status >= 300) {
      const contentType = result.headers["content-type"] || "";
      let bodyError: string | null = null;
      if (contentType.includes("application/json") && result.body) {
        bodyError = getApiErrorMessage(tryParseJson(result.body));
      }
      const message = userFacingHttpError(
        result.status,
        bodyError,
        result.body.slice(0, 800) || `Split failed: ${result.status}`,
      );
      throw new Error(message);
    }

    const json: unknown = tryParseJson(result.body);
    if (result.status === 202 && isAcceptedJobIdResponse(json)) {
      // Store job_token if backend issued one (requires JOB_TOKEN_SECRET to be set)
      if (typeof json.job_token === "string" && json.job_token) {
        setJobToken(json.job_id, json.job_token);
      }
      return { job_id: json.job_id };
    }
    throw new Error("Unexpected response from split");
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") throw new Error("Stem service did not accept in time. Try again.");
      throw err;
    }
    throw new Error("Stem split request failed");
  }
}

/** Start split and poll until done; calls onProgress with each status. Returns final stems on success. */
export async function splitStems(
  file: File,
  stems: "2" | "4",
  quality?: SplitQuality,
  isSample?: boolean,
  onProgress?: (status: StemJobStatus) => void,
  onUploadProgress?: (event: UploadProgressEvent) => void,
  intent?: SplitIntent,
): Promise<SplitResponse> {
  const { job_id } = await startStemSplit(
    file,
    stems,
    quality,
    isSample,
    onUploadProgress,
    intent,
  );
  const final = await streamStemJobUntilDone(job_id, (s) => onProgress?.(s));
  if (final.status === "completed" && final.stems) {
    return { job_id, status: "completed", stems: final.stems, beat_grid: final.beat_grid };
  }
  throw new Error(userFacingApiError(final.error ?? null, "Stem separation failed"));
}

/** Start expand (2-stem → 4-stem). Returns new job_id. Poll status until completed. */
export async function startExpand(
  jobId: string,
  quality?: SplitQuality
): Promise<{ job_id: string }> {
  const body = JSON.stringify({ job_id: jobId, quality: quality ?? "quality" });
  const res = await fetchWithRetry(
    `${API_BASE}/api/stems/expand`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
        ...jobTokenHeader(jobId),
      },
      body,
    },
    { maxAttempts: 2, retryOn: [502, 503, 504] },
  );
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
  const final = await streamStemJobUntilDone(job_id, (s) => onProgress?.(s));
  if (final.status === "completed" && final.stems) {
    return { job_id, status: "completed", stems: final.stems, beat_grid: final.beat_grid };
  }
  throw new Error(userFacingApiError(final.error ?? null, "Expand failed"));
}

/**
 * Server-side master WAV (`POST /api/stems/server-export`). Backend must have **SERVER_EXPORT_ENABLED**; otherwise **404**.
 * When **USAGE_TOKENS_ENABLED**, the backend debits tokens (minute basis — same contract as split/expand). Returns a WAV `Blob`; callers may fall back to client render on 404. See **`docs/BILLING-AND-TOKENS.md`** / **`ARCHITECTURE-FLOW.md`**.
 */
export async function serverExportMasterWav(request: ServerExportMasterRequest): Promise<Blob> {
  const res = await fetchWithRetry(
    `${API_BASE}/api/stems/server-export`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(request),
    },
    { maxAttempts: 2, retryOn: [502, 503, 504] },
  );

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
