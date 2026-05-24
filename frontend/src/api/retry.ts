/**
 * Fetch with exponential backoff retry.
 *
 * Retries on transient failures (network errors, 502/503/504) with configurable
 * backoff. Does NOT retry client errors (400/401/403/404/429) since those
 * indicate a problem the client must fix.
 */

export interface RetryConfig {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Default: 1000. */
  baseDelay?: number;
  /** Multiplier applied to delay after each attempt. Default: 2. */
  multiplier?: number;
  /** Random jitter range in ms (±). Default: 200. */
  jitter?: number;
  /** HTTP status codes that trigger a retry. Default: [502, 503, 504]. */
  retryOn?: number[];
  /** Called before each retry with attempt number and delay. */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "onRetry">> = {
  maxAttempts: 3,
  baseDelay: 1000,
  multiplier: 2,
  jitter: 200,
  retryOn: [502, 503, 504],
};

/** Returns true if the error is a network failure (not an HTTP response). */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (
    error instanceof Error &&
    (error.message.includes("NetworkError") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("network"))
  ) {
    return true;
  }
  return false;
}

/** Compute delay with exponential backoff + jitter. */
function computeDelay(attempt: number, config: Required<Omit<RetryConfig, "onRetry">>): number {
  const exponential = config.baseDelay * Math.pow(config.multiplier, attempt - 1);
  const jitter = (Math.random() * 2 - 1) * config.jitter;
  return Math.max(0, exponential + jitter);
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on transient failures.
 *
 * @param input - URL or Request object (same as native fetch).
 * @param init - RequestInit options (same as native fetch).
 * @param retryConfig - Retry behavior configuration.
 * @returns The Response from a successful fetch.
 * @throws The last error if all retries are exhausted.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryConfig?: RetryConfig,
): Promise<Response> {
  const config = { ...DEFAULT_CONFIG, ...retryConfig };
  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);

      // Don't retry if the response is successful or a non-retryable error
      if (!config.retryOn.includes(response.status)) {
        return response;
      }

      // Retryable HTTP status — treat as transient failure
      lastResponse = response;
      lastError = new Error(`HTTP ${response.status}`);

      if (attempt < config.maxAttempts) {
        const delay = computeDelay(attempt, config);
        retryConfig?.onRetry?.(attempt, delay, lastError);
        await sleep(delay);
      }
    } catch (error) {
      lastError = error;

      // Only retry network errors, not aborts or other exceptions
      if (!isNetworkError(error) || attempt >= config.maxAttempts) {
        throw error;
      }

      const delay = computeDelay(attempt, config);
      retryConfig?.onRetry?.(attempt, delay, error);
      await sleep(delay);
    }
  }

  // All retries exhausted — return the last response if we have one (retryable HTTP status)
  if (lastResponse) return lastResponse;

  // All retries exhausted
  throw lastError;
}
