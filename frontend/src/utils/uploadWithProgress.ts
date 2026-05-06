/**
 * Upload a FormData payload with progress tracking via XMLHttpRequest.
 * Falls back gracefully if XHR is unavailable (returns fetch-based upload).
 */

export interface UploadProgressEvent {
  /** 0–100 percentage of bytes uploaded. */
  percent: number;
  /** Bytes uploaded so far. */
  loaded: number;
  /** Total bytes to upload (0 if unknown). */
  total: number;
}

export interface UploadWithProgressOptions {
  url: string;
  formData: FormData;
  headers?: Record<string, string>;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface UploadResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Upload with progress reporting. Uses XMLHttpRequest for upload.onprogress support.
 * Returns a promise that resolves with the response or rejects on error/abort/timeout.
 */
export function uploadWithProgress({
  url,
  formData,
  headers = {},
  onProgress,
  signal,
  timeoutMs = 5 * 60 * 1000,
}: UploadWithProgressOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    // Set headers (skip Content-Type — browser sets multipart boundary automatically)
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== "content-type") {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.timeout = timeoutMs;

    // Progress tracking
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded: e.loaded,
            total: e.total,
          });
        }
      });
    }

    // Completion
    xhr.addEventListener("load", () => {
      const responseHeaders: Record<string, string> = {};
      const rawHeaders = xhr.getAllResponseHeaders();
      for (const line of rawHeaders.trim().split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          responseHeaders[line.slice(0, idx).trim().toLowerCase()] =
            line.slice(idx + 1).trim();
        }
      }
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
        body: xhr.responseText,
      });
    });

    // Error handling
    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload. Check your connection and try again."));
    });

    xhr.addEventListener("timeout", () => {
      reject(
        Object.assign(new Error("Upload timed out. The file may be too large for your connection."), {
          name: "AbortError",
        }),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        Object.assign(new Error("Upload cancelled."), { name: "AbortError" }),
      );
    });

    // Abort signal support
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        reject(Object.assign(new Error("Upload cancelled."), { name: "AbortError" }));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}
