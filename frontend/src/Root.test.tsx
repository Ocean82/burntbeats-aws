import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Root } from "./Root"

vi.mock("@clerk/react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: () => Promise.resolve("test-token"),
  }),
  useUser: () => ({
    isLoaded: true,
    user: {
      id: "user_test",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      unsafeMetadata: { planPickerSeen: true },
      update: vi.fn(),
    },
  }),
}))

vi.mock("./api", () => ({
  setTokenProvider: vi.fn(),
}))

vi.mock("./config", () => ({
  isLocalDevFullApp: () => false,
}))

vi.mock("./analytics/checkoutTracking", () => ({
  trackCheckoutReturnedOnce: vi.fn(),
}))

vi.mock("./analytics/signupTracking", () => ({
  trackSignupCompletedOnce: vi.fn(),
}))

vi.mock("./analytics/usePageViews", () => ({
  usePageViews: vi.fn(),
}))

vi.mock("./seo/useDocumentMeta", () => ({
  useDocumentMeta: vi.fn(),
}))

vi.mock("./hooks/useReferralCapture", () => ({
  captureReferralFromUrl: vi.fn(),
  useReferralAttach: vi.fn(),
}))

vi.mock("./pages/NotFoundPage", () => ({
  NotFoundPage: () => <div data-testid="not-found">Not found</div>,
}))

vi.mock("./pages/PlanPickerPage", () => ({
  PlanPickerPage: () => <div data-testid="plan-picker">Plan picker</div>,
}))

vi.mock("./pages/LandingPage", () => ({
  LandingPage: () => <div data-testid="landing-page">Landing</div>,
}))

vi.mock("./pages/LegalPage", () => ({
  LegalPage: () => <div data-testid="legal-page">Legal</div>,
}))

vi.mock("./pages/ReferralPage", () => ({
  ReferralPage: () => <div data-testid="referral-page">Referral</div>,
}))

vi.mock("./app/app-shell.component", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

vi.mock("./App", () => ({
  App: () => <div data-testid="editor-app">Editor app</div>,
}))

vi.mock("./components/LegalAcceptanceGate", () => ({
  LegalAcceptanceGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("./contexts/StemMediaContext", () => ({
  StemMediaProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("./contexts/AudioContext", () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("./contexts/WorkflowContext", () => ({
  WorkflowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

describe("Root routing", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/app")
  })

  afterEach(() => {
    window.history.pushState({}, "", "/")
  })

  it("routes Clerk fallback redirects at /app into the signed-in workspace", async () => {
    render(<Root />)

    expect(await screen.findByTestId("editor-app")).toBeInTheDocument()
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument()
  })
})
