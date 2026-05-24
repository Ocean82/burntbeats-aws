import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "./retry";

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns response on first successful attempt", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("/api/test");
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 400 client error", async () => {
    const mockResponse = new Response("Bad Request", { status: 400 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("/api/test");
    expect(result.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 unauthorized", async () => {
    const mockResponse = new Response("Unauthorized", { status: 401 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("/api/test");
    expect(result.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 429 rate limited", async () => {
    const mockResponse = new Response("Too Many Requests", { status: 429 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("/api/test");
    expect(result.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 502 and succeeds on second attempt", async () => {
    const failResponse = new Response("Bad Gateway", { status: 502 });
    const successResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const promise = fetchWithRetry("/api/test", undefined, {
      baseDelay: 10,
      jitter: 0,
    });

    // Advance timers to allow retry delay
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 up to maxAttempts then returns last response", async () => {
    vi.useRealTimers(); // Real timers — short delays
    const failResponse = new Response("Service Unavailable", { status: 503 });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(failResponse);

    const result = await fetchWithRetry("/api/test", undefined, {
      maxAttempts: 3,
      baseDelay: 5,
      jitter: 0,
    });

    expect(result.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries on network error and succeeds", async () => {
    const successResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(successResponse);

    const promise = fetchWithRetry("/api/test", undefined, {
      baseDelay: 10,
      jitter: 0,
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws on network error after all retries exhausted", async () => {
    vi.useRealTimers(); // Real timers for this test — short delays
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await expect(
      fetchWithRetry("/api/test", undefined, {
        maxAttempts: 2,
        baseDelay: 5,
        jitter: 0,
      }),
    ).rejects.toThrow("Failed to fetch");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry callback before each retry", async () => {
    const failResponse = new Response("Bad Gateway", { status: 502 });
    const successResponse = new Response("OK", { status: 200 });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const onRetry = vi.fn();
    const promise = fetchWithRetry("/api/test", undefined, {
      baseDelay: 10,
      jitter: 0,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(50);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error));
  });

  it("does not retry AbortError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      fetchWithRetry("/api/test", undefined, { maxAttempts: 3 }),
    ).rejects.toThrow("Aborted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("respects custom retryOn status codes", async () => {
    const response418 = new Response("I'm a teapot", { status: 418 });
    const successResponse = new Response("OK", { status: 200 });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response418)
      .mockResolvedValueOnce(successResponse);

    const promise = fetchWithRetry("/api/test", undefined, {
      retryOn: [418],
      baseDelay: 10,
      jitter: 0,
    });

    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
