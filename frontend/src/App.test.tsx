import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./app/app-shell.component";
import { App } from "./App";
import { AudioProvider } from "./contexts/AudioContext";
import { WorkflowProvider } from "./contexts/WorkflowContext";

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
});

describe("App flow", () => {
  function renderApp() {
    return render(
      <WorkflowProvider>
        <AudioProvider>
          <AppShell>
            <App />
          </AppShell>
        </AudioProvider>
      </WorkflowProvider>,
    );
  }

  it("renders and shows stem splitter UI", async () => {
    renderApp();
    expect(
      await screen.findByRole("button", { name: /upload audio file/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^split$/i }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows workflow stepper labels", async () => {
    renderApp();
    const stepper = await screen.findByRole("list", { name: /workflow steps/i });
    expect(within(stepper).getByText("Upload")).toBeInTheDocument();
    expect(within(stepper).getByText("Split")).toBeInTheDocument();
    expect(within(stepper).getByText("Mix")).toBeInTheDocument();
  });
});
