import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiGet, apiPost, apiPostForm, clearResponseCache } from "./client"
import { setTokenProvider } from "./auth"

describe("api client retry defaults", () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    clearResponseCache()
    setTokenProvider(() => Promise.resolve(null))
  })

  it("does not retry POST requests unless retry is explicitly configured", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

    const result = await apiPost<{ ok: boolean }>("/api/create-job", {
      name: "mix.wav",
    })

    expect(result).toMatchObject({
      data: null,
      status: 503,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not retry FormData POST requests unless retry is explicitly configured", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

    const result = await apiPostForm<{ ok: boolean }>(
      "/api/upload-job",
      new FormData(),
    )

    expect(result).toMatchObject({
      data: null,
      status: 503,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("keeps GET retries for transient failures", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

    const result = await apiGet<{ ok: boolean }>("/api/status", {
      retry: { baseDelay: 1, jitter: 0 },
    })

    expect(result).toMatchObject({
      data: { ok: true },
      error: null,
      status: 200,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("allows explicit retries for callers that provide an idempotent write contract", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

    const result = await apiPost<{ ok: boolean }>(
      "/api/idempotent-write",
      { idempotencyKey: "job-1" },
      { retry: { baseDelay: 1, jitter: 0 } },
    )

    expect(result).toMatchObject({
      data: { ok: true },
      error: null,
      status: 200,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
