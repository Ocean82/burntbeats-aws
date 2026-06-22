import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react"
import { screen, fireEvent, waitFor } from "@testing-library/dom";
import { EditorAppShell } from "../EditorAppShell";

/**
 * Integration tests for the full split flow.
 * Validates: Requirements 1.3, 1.4, 1.5, 1.7, 6.4
 */

// Mock framer-motion to avoid animation complexities in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock useReducedMotion
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// Mock Workspace to avoid complex dependencies (WorkflowContext, hooks, etc.)
vi.mock("../workspace/Workspace", () => ({
  Workspace: () => <div data-testid="workspace">Workspace Mock</div>,
}));

// ---- App Store mock with mutable state ----
let mockStoreState = {
  splitResultStems: [] as Array<{ id: string; url: string }>,
  splitProgress: 0,
  isSplitting: false,
};

vi.mock("@/store/appStore", () => ({
  useAppStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

const SESSION_KEY = "burnt-beats-split-result";

beforeEach(() => {
  sessionStorage.clear();
  mockStoreState = {
    splitResultStems: [],
    splitProgress: 0,
    isSplitting: false,
  };
});

afterEach(() => {
  sessionStorage.clear();
});

describe("Split Flow Integration — Upload → Configure → Split → Workspace", () => {
  /**
   * Validates: Req 1.3 (valid file → configure), Req 1.4 (split → splitting), Req 1.5 (complete → workspace)
   */
  it("transitions through the full split flow: upload → configure → splitting → workspace", async () => {
    const { rerender } = render(<EditorAppShell />);

    // Phase 1: Upload phase is visible
    expect(screen.getByTestId("upload-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();

    // Simulate file upload via the hidden input
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const validFile = new File(["audio-data"], "test-track.wav", {
      type: "audio/wav",
    });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [validFile] } });
    });

    // Phase 2: Should transition to configure phase (Req 1.3)
    expect(screen.getByTestId("configure-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-phase")).not.toBeInTheDocument();

    // Click the "Split" button to start splitting (Req 1.4)
    const splitButton = screen.getByRole("button", { name: /split/i });
    await act(async () => {
      fireEvent.click(splitButton);
    });

    // Phase 3: Should transition to splitting phase
    expect(screen.getByTestId("splitting-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();

    // Simulate split completion: update store with stems (Req 1.5)
    mockStoreState = {
      splitResultStems: [
        { id: "vocals", url: "/stems/vocals.wav" },
        { id: "drums", url: "/stems/drums.wav" },
      ],
      splitProgress: 100,
      isSplitting: false,
    };

    // Re-render to pick up the new store state
    await act(async () => {
      rerender(<EditorAppShell />);
    });

    // Phase 4: Should transition to workspace
    await waitFor(() => {
      expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("splitting-phase")).not.toBeInTheDocument();
  });
});

describe("Split Flow Integration — New Split resets to upload", () => {
  /**
   * Validates: Req 6.4 (New Split confirm resets to upload, clears data first)
   * Since NewSplitAction component doesn't exist yet, we test the reset behavior
   * via the PhaseController's reset() which clears sessionStorage and transitions to upload.
   */
  it("reset clears sessionStorage and returns to upload phase", async () => {
    // Start with session data so we begin in workspace phase
    const sessionData = JSON.stringify({
      stemIds: ["vocals", "drums"],
      stemCount: 2,
      timestamp: Date.now(),
    });
    sessionStorage.setItem(SESSION_KEY, sessionData);

    // Render — should start in workspace due to session data
    render(<EditorAppShell />);
    expect(screen.getByTestId("workspace")).toBeInTheDocument();

    // Verify session data is set
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    // To test reset, we import and use usePhaseController directly through a test harness
    // Since EditorAppShell doesn't expose a direct reset button yet,
    // we'll test this with a wrapper that accesses PhaseContext

    // Re-render with a component that has access to the context
    // We need to render inside PhaseProvider which EditorAppShell already provides
    // Instead, let's test this differently — use renderHook for the controller
    const { renderHook } = await import("@testing-library/react");
    const { usePhaseController } = await import("@/hooks/usePhaseController");

    // Re-set session storage since we need it for the hook test
    sessionStorage.setItem(SESSION_KEY, sessionData);

    const { result } = renderHook(() => usePhaseController());

    // Hook should initialize to workspace since session data exists
    expect(result.current.phase).toBe("workspace");
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    // Call reset — should clear sessionStorage and go to upload
    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe("upload");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("Split Flow Integration — Session restore", () => {
  /**
   * Validates: Req 1.7 (session persistence and restore to workspace on mount)
   */
  it("restores to workspace phase when session data exists on mount", () => {
    // Pre-populate sessionStorage with split result data
    const sessionData = JSON.stringify({
      stemIds: ["vocals", "drums", "bass", "other"],
      stemCount: 4,
      timestamp: Date.now(),
    });
    sessionStorage.setItem(SESSION_KEY, sessionData);

    render(<EditorAppShell />);

    // Should start directly in workspace phase — no upload or configure visible
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splitting-phase")).not.toBeInTheDocument();
  });

  it("starts in upload phase when no session data exists", () => {
    // sessionStorage is clear (beforeEach handles this)
    render(<EditorAppShell />);

    expect(screen.getByTestId("upload-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });

  it("persists split result to sessionStorage when stems arrive", async () => {
    // Start with no session data
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    // Simulate split completing with stems in store
    mockStoreState = {
      splitResultStems: [
        { id: "vocals", url: "/stems/vocals.wav" },
        { id: "instrumental", url: "/stems/instrumental.wav" },
      ],
      splitProgress: 100,
      isSplitting: false,
    };

    render(<EditorAppShell />);

    // After render with stems, session data should be persisted
    await waitFor(() => {
      const stored = sessionStorage.getItem(SESSION_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.stemIds).toEqual(["vocals", "instrumental"]);
      expect(parsed.stemCount).toBe(2);
      expect(parsed.timestamp).toBeGreaterThan(0);
    });
  });
});
