import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorAppShell } from "../EditorAppShell";

// Mock framer-motion for PhaseRouter animations
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

// Mock useReducedMotion used inside PhaseRouter
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// Mock the Workspace component to avoid its complex dependencies
vi.mock("../workspace/Workspace", () => ({
  Workspace: () => <div data-testid="workspace-phase">Workspace</div>,
}));

// Mock the appStore (EditorAppShell uses it to monitor split results)
vi.mock("@/store/appStore", () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      splitResultStems: [],
      splitProgress: 0,
      isSplitting: false,
    }),
}));

// Ensure sessionStorage starts clean so phase defaults to "upload"
beforeEach(() => {
  sessionStorage.clear();
});

describe("EditorAppShell", () => {
  it("renders with data-testid", () => {
    render(<EditorAppShell />);
    expect(screen.getByTestId("editor-app-shell")).toBeInTheDocument();
  });

  it("renders HeaderBar", () => {
    render(<EditorAppShell />);
    expect(screen.getByTestId("header-bar")).toBeInTheDocument();
  });

  it("renders PhaseRouter (upload phase by default)", () => {
    render(<EditorAppShell />);
    expect(screen.getByTestId("upload-phase")).toBeInTheDocument();
  });

  it("uses flex column layout with full height and dark background", () => {
    render(<EditorAppShell />);
    const shell = screen.getByTestId("editor-app-shell");
    expect(shell).toHaveClass("flex", "h-full", "flex-col");
    expect(shell).toHaveClass("bg-[hsl(220,15%,8%)]");
  });

  it("does not render workspace elements while in upload phase (Req 3.2)", () => {
    render(<EditorAppShell />);
    expect(screen.queryByTestId("workspace-phase")).not.toBeInTheDocument();
  });
});

describe("EditorAppShell — PhaseContext", () => {
  it("provides phase context to descendants", () => {
    // We cannot easily inject PhaseContextConsumer into the tree rendered by
    // EditorAppShell without modifying it, so we verify by checking that the
    // shell renders correctly (which means PhaseProvider is working — HeaderBar
    // and PhaseRouter receive the phase). This verifies the integration
    // implicitly since PhaseRouter renders the upload phase correctly.
    render(<EditorAppShell />);
    // If PhaseProvider were missing, HeaderBar/PhaseRouter would not have
    // correct phase data and would fail to render the upload phase.
    expect(screen.getByTestId("upload-phase")).toBeInTheDocument();
    expect(screen.getByTestId("header-bar")).toBeInTheDocument();
  });
});
