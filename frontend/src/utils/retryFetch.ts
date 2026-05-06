/**
 * Retry utility for network requests with exponential backoff.
 * Designed for mobile connections that may drop temporarily.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2). */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 2000). */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2). */
  backoffMultiplier?: number;
  /** Maximum delay between retries in ms (default: 10000). */
  maxDelayMs?: number;
  /** Callback when a retry is about to happen. */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** AbortSignal to cancel retries. */
  signal?: AbortSignal;
}

/**
 * Determine if an error is a transient network error worth retrying.
 * - TypeError from fetch = network failure (offline, DNS, connection reset)
 * - 5xx server errors = transient server issues
 * - 408 Request Timeout
 * - 429 Too Many Requests (with backoff)
 */
export function isRetryableError(error: unknown): boolean {
  // Network errors from fetch throw TypeError
  if (error instanceof TypeError) return true;

  // Check for our custom upload errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("network error")) return true;
    if (msg.includes("connection")) return true;
    if (msg.includes("timed out") || error.name === "AbortError") return false; // Don't retry timeouts
  }

  return false;
}

/**
 * Check if an HTTP status code is retryable.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/**
 * Execute an async function with retry logic.
 * Only retries on transient network errors, not on validation/auth errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 2,
    initialDelayMs = 2000,
    backoffMultiplier = 2,
    maxDelayMs = 10000,
    onRetry,
    signal,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Request cancelled."), { name: "AbortError" });
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry non-transient errors
      if (!isRetryableError(err)) {
        throw lastError;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Notify caller about retry
      onRetry?.(attempt + 1, lastError, delay);

      // Wait before retrying
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("Request cancelled."), { name: "AbortError" }));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });

      // Exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError ?? new Error("Retry failed");
}

/**
 * Check if the browser is currently online.
 * Returns true if online or if the API is unavailable (assume online).
 */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
