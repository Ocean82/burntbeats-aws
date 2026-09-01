import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSubscription } from "./useSubscription"
import { apiGet, apiPost } from "../api/client"

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

vi.mock("../api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock("../analytics/events", () => ({
  trackEvent: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)

describe("useSubscription checkout interval", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApiGet.mockResolvedValue({
      data: { active: false, plan: null },
      error: null,
      status: 200,
    })
    mockedApiPost.mockResolvedValue({
      data: null,
      error: "checkout unavailable",
      status: 503,
    })
  })

  it("defaults checkout to monthly billing when no interval is selected", async () => {
    const { result } = renderHook(() => useSubscription())

    await waitFor(() => expect(result.current.status).toBe("inactive"))

    await act(async () => {
      await result.current.startCheckout("premium", {
        source: "paywall_banner",
        intent: "blocked_split_checkout_premium",
      })
    })

    expect(mockedApiPost).toHaveBeenCalledWith("/api/billing/checkout", {
      plan: "premium",
      interval: "month",
      returnUrl: "http://localhost:3000",
      source: "paywall_banner",
      intent: "blocked_split_checkout_premium",
    })
  })

  it("preserves explicit yearly billing selections", async () => {
    const { result } = renderHook(() => useSubscription())

    await waitFor(() => expect(result.current.status).toBe("inactive"))

    await act(async () => {
      await result.current.startCheckout("premium", {
        source: "pricing_page",
        intent: "pricing_page_cta",
        interval: "year",
      })
    })

    expect(mockedApiPost).toHaveBeenCalledWith("/api/billing/checkout", {
      plan: "premium",
      interval: "year",
      returnUrl: "http://localhost:3000",
      source: "pricing_page",
      intent: "pricing_page_cta",
    })
  })
})
