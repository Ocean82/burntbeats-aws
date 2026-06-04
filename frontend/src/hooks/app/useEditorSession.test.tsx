import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { WorkflowProvider } from "../../contexts/WorkflowContext"
import { AudioProvider } from "../../contexts/AudioContext"
import { StemMediaProvider } from "../../contexts/StemMediaContext"
import { useEditorSession } from "./useEditorSession"

vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    getToken: () => Promise.resolve(null),
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { fullName: "Test", imageUrl: null },
  }),
}))

vi.mock("./useSubscriptionCoordinator", () => ({
  useSubscriptionCoordinator: () => ({
    subscription: {
      status: "active",
      plan: "basic",
      billingError: null,
      startCheckout: vi.fn(),
      capabilities: {
        canSplitFourStems: true,
        canUsePremiumStemQualities: true,
      },
    },
    usageBalance: null,
    usageLoading: false,
    stemQualityOptions: [],
    canSplitFourStems: true,
    canExpandToFourStems: false,
    canUsePremiumStemQualities: true,
    canUseBatchQueue: false,
    uploadDurationSec: null,
    estimatedSplitTokens: null,
    splitQuality: "speed" as const,
  }),
}))

vi.mock("../workflow/useEditorViewRouting", () => ({
  useEditorViewRouting: () => ({
    activeView: "editor" as const,
    setActiveView: vi.fn(),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <WorkflowProvider>
      <StemMediaProvider>
        <AudioProvider>{children}</AudioProvider>
      </StemMediaProvider>
    </WorkflowProvider>
  )
}

describe("useEditorSession", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(""),
        }),
      ),
    )
  })

  it("exposes editor session shape including editorMainViewProps", () => {
    const { result } = renderHook(() => useEditorSession(), { wrapper })
    expect(result.current.activeView).toBe("editor")
    expect(result.current.editorMainViewProps).toMatchObject({
      chrome: expect.objectContaining({
        subscription: expect.any(Object),
      }),
      processingProps: expect.any(Object),
      mixerProps: expect.any(Object),
    })
    expect(typeof result.current.triggerSplit).toBe("function")
    expect(typeof result.current.resetStemMediaState).toBe("function")
  })
})
