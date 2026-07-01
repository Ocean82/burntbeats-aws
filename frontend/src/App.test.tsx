import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";
import { AudioProvider } from "./contexts/AudioContext";
import { StemMediaProvider } from "./contexts/StemMediaContext";
import { WorkflowProvider } from "./contexts/WorkflowContext";

vi.mock("./hooks/workflow/useEditorViewRouting", () => ({
  useEditorViewRouting: () => ({ activeView: "editor", setActiveView: () => {} }),
}));

vi.mock("./views/lazy-view-registry", () => ({
  useViewPreloading: () => {},
  preloadView: vi.fn(),
  getViewsToPreload: () => [],
}));

vi.mock("../api/stemHistory", () => ({
  fetchStemHistory: () =>
    Promise.resolve({
      jobs: [
        {
          job_id: "test-job",
          status: "completed",
          stems: 2,
          quality: null,
          original_filename: "test.wav",
          duration_seconds: 180,
          token_cost: 10,
          model_name: "test-model",
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          stem_files: [],
        },
      ],
      total: 1,
    }),
}));

// Mock Clerk so App can render without ClerkProvider in tests
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: () => Promise.resolve(null) }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: "Test User",
      imageUrl: null,
      primaryEmailAddress: { emailAddress: "test@example.com" },
    },
  }),
  useClerk: () => ({
    openUserProfile: vi.fn(),
    signOut: vi.fn(),
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => <button type="button">Account</button>,
}));

// Avoid real fetch and ResizeObserver in tests
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve("") }))
  );
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }))
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

describe("App flow", () => {
  function renderApp() {
    return render(
      <WorkflowProvider>
        <StemMediaProvider>
          <AudioProvider>
            <AppShell>
              <App />
            </AppShell>
          </AudioProvider>
        </StemMediaProvider>
      </WorkflowProvider>,
    );
  }

  it("renders and shows stem splitter UI", async () => {
    renderApp();
    // The transitional editor shell renders the upload phase by default
    expect(
      await screen.findByRole("button", { name: /upload audio file/i }, { timeout: 15000 }),
    ).toBeInTheDocument();
  }, 20000);

  it("shows workflow stepper labels", async () => {
    renderApp();
    // The transitional editor shell renders the step progress indicator
    const stepper = await screen.findByRole("list", { name: /workflow steps/i });
    expect(within(stepper).getByText("Upload")).toBeInTheDocument();
    expect(within(stepper).getByText("Split")).toBeInTheDocument();
    expect(within(stepper).getByText("Mix")).toBeInTheDocument();
  });
});
