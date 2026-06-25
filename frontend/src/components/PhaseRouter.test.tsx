import { render } from "@testing-library/react"
import { screen } from "@testing-library/dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PropsWithChildren, ComponentPropsWithoutRef } from "react";
import { PhaseRouter, type PhaseRouterProps } from "./PhaseRouter";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, getToken: () => Promise.resolve(null) }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: PropsWithChildren<ComponentPropsWithoutRef<"div">>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
}));

let mockReducedMotion = false;
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

// Mock the Workspace component to avoid its complex dependencies
vi.mock("./workspace/Workspace", () => ({
  Workspace: () => <div data-testid="workspace-phase">Workspace</div>,
}));

describe("PhaseRouter", () => {
  const defaultProps: PhaseRouterProps = {
    phase: "upload",
    transitionTo: vi.fn(),
    error: null,
    setError: vi.fn(),
    onFileAccepted: vi.fn(),
    fileName: "track.wav",
    onConfigure: vi.fn(),
    progress: 0,
    onRetry: vi.fn(),
    estimatedSeconds: null,
  };

  beforeEach(() => {
    mockReducedMotion = false;
  });

  function setup(overrides: Partial<PhaseRouterProps> = {}) {
    const props = { ...defaultProps, ...overrides };
    return render(<PhaseRouter {...props} />);
  }

  it("renders only the upload phase when phase is 'upload'", () => {
    setup({ phase: "upload" });
    expect(screen.getByTestId("upload-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splitting-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-phase")).not.toBeInTheDocument();
  });

  it("renders only the configure phase when phase is 'configure'", () => {
    setup({ phase: "configure" });
    expect(screen.getByTestId("configure-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splitting-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-phase")).not.toBeInTheDocument();
  });

  it("renders only the splitting phase when phase is 'splitting'", () => {
    setup({ phase: "splitting" });
    expect(screen.getByTestId("splitting-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-phase")).not.toBeInTheDocument();
  });

  it("renders only the workspace placeholder when phase is 'workspace'", () => {
    setup({ phase: "workspace" });
    expect(screen.getByTestId("workspace-phase")).toBeInTheDocument();
    expect(screen.queryByTestId("upload-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("configure-phase")).not.toBeInTheDocument();
    expect(screen.queryByTestId("splitting-phase")).not.toBeInTheDocument();
  });

  it("passes transitionTo and error to UploadPhase", () => {
    const transitionTo = vi.fn();
    setup({ phase: "upload", transitionTo, error: "Upload failed" });
    // UploadPhase renders the error message via role="alert"
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
  });

  it("passes fileName to ConfigurePhase", () => {
    setup({ phase: "configure", fileName: "my-song.mp3" });
    expect(screen.getByText("my-song.mp3")).toBeInTheDocument();
  });

  it("passes progress to SplittingPhase", () => {
    setup({ phase: "splitting", progress: 42 });
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});
