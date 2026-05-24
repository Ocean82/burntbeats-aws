/**
 * Centralized API client with auth injection, retry, and error normalization.
 *
 * All API calls should route through this client to get consistent behavior:
 * - Automatic Bearer token injection from Clerk
 * - Exponential backoff retry on transient failures
 * - Normalized error responses
 * - Request timeout via AbortController
 */
import { authHeaders } from "./auth";
import { fetchWithRetry, type RetryConfig } from "./retry";

/** Normalized API response — always has either data or error, never both. */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface ApiRequestOptions {
  /** Override retry configuration for this request. */
  retry?: RetryConfig | false;
  /** Request timeout in ms. Default: 30000. */
  timeout?: number;
  /** Additional headers to merge. */
  headers?: Record<string, string>;
  /** AbortSignal for external cancellation. */
  signal?: AbortSignal;
  /** Called before each retry (for showing "retrying..." UI). */
  onRetry?: (attempt: number, delayMs: number) => void;
}

const DEFAULT_TIMEOUT = 30_000;

/** Get the API base URL (empty string for same-origin). */
function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "";
}

/** Extract a user-facing error message from a response body. */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.error === "string") return body.error;
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.message === "string") return body.message;
  } catch {
    // Response body is not JSON — use status text
  }
  return response.statusText || `Request failed (${response.status})`;
}

/**
 * Make an authenticated GET request with retry.
 */
export async function apiGet<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>("GET", path, undefined, options);
}

/**
 * Make an authenticated POST request with JSON body and retry.
 */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  return apiRequest<T>("POST", path, body, options);
}

/**
 * Make an authenticated POST request with FormData body and retry.
 */
export async function apiPostForm<T>(
  path: string,
  formData: FormData,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${path}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine external signal with timeout
  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const auth = await authHeaders();
    const headers: Record<string, string> = {
      ...auth,
      ...(options.headers || {}),
    };
    // Don't set Content-Type for FormData — browser sets it with boundary

    const retryConfig: RetryConfig | undefined =
      options.retry === false
        ? { maxAttempts: 1 }
        : { onRetry: options.onRetry, ...(options.retry || {}) };

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: formData,
        signal,
      },
      retryConfig,
    );

    if (response.ok || response.status === 202) {
      const data = (await response.json()) as T;
      return { data, error: null, status: response.status };
    }

    const error = await extractErrorMessage(response);
    return { data: null, error, status: response.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: "Request timed out", status: 0 };
    }
    const message =
      err instanceof Error ? err.message : "Network error";
    return { data: null, error: message, status: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Core request function — handles auth, retry, timeout, and error normalization.
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${path}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const auth = await authHeaders();
    const headers: Record<string, string> = {
      ...auth,
      ...(options.headers || {}),
    };

    const init: RequestInit = { method, headers, signal };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const retryConfig: RetryConfig | undefined =
      options.retry === false
        ? { maxAttempts: 1 }
        : { onRetry: options.onRetry, ...(options.retry || {}) };

    const response = await fetchWithRetry(url, init, retryConfig);

    if (response.ok || response.status === 202) {
      // Some endpoints return empty body (204)
      if (response.status === 204) {
        return { data: null as unknown as T, error: null, status: 204 };
      }
      const data = (await response.json()) as T;
      return { data, error: null, status: response.status };
    }

    const error = await extractErrorMessage(response);
    return { data: null, error, status: response.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: "Request timed out", status: 0 };
    }
    const message =
      err instanceof Error ? err.message : "Network error";
    return { data: null, error: message, status: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combine multiple AbortSignals — aborts when any signal fires.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}
