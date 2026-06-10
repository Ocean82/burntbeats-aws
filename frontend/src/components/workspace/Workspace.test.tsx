import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { LAYOUT } from "@/constants/layout";

// Mock hooks
const mockToolDrawer: { activeTool: import("@/types/tools").ToolCategory | null; isOpen: boolean; open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; toggle: ReturnType<typeof vi.fn> } = { activeTool: null, isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() };
const mockWorkspaceLayout = { mixerExpanded: true, toggleMixer: vi.fn(), viewportSize: { width: 1280, height: 900 } };

vi.mock("@/hooks/useToolDrawer", () => ({
  useToolDrawer: () => mockToolDrawer,
}));

vi.mock("@/hooks/useWorkspaceLayout", () => ({
  useWorkspaceLayout: () => mockWorkspaceLayout,
}));

vi.mock("@/contexts/WorkflowContext", () => ({
  useWorkflow: () => ({
    stemStates: { "stem-1": { pitchSemitones: 0, timeStretch: 1, fadeIn: 0, fadeOut: 0, mixer: { gain: 0, pan: 0, eqLow: 0, eqMid: 0, eqHigh: 0, reverbWet: 0, delayWet: 0 } } },
    setStemStates: vi.fn(),
  }),
}));

let mediaQueryResult: Record<string, boolean> = {};
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => mediaQueryResult[query] ?? false,
}));

// Mock framer-motion AnimatePresence to just render children
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

// Mock EffectsPanelBottomSheet
vi.mock("./EffectsPanelBottomSheet", () => ({
  EffectsPanelBottomSheet: ({ activeTool, onClose }: Record<string, unknown>) => (
    <div data-testid="effects-bottom-sheet" data-tool={activeTool as string}>
      <button onClick={onClose as React.MouseEventHandler}>Close</button>
    </div>
  ),
}));

// Mock MixerConsole
vi.mock("./MixerConsole", () => ({
  MixerConsole: () => <div data-testid="mixer-console" />,
}));

function setViewport(opts: { desktop?: boolean; tablet?: boolean; tall?: boolean }) {
  const desktop = opts.desktop ?? true;
  const tablet = opts.tablet ?? true;
  const tall = opts.tall ?? true;
  mediaQueryResult = {
    [`(min-width: ${LAYOUT.BREAKPOINT_DESKTOP}px)`]: desktop,
    [`(min-width: ${LAYOUT.BREAKPOINT_TABLET}px)`]: tablet,
    [`(min-height: ${LAYOUT.BREAKPOINT_TABLET}px)`]: tall,
  };
}

describe("Workspace", () => {
  describe("desktop layout (≥1024px wide, ≥768px tall)", () => {
    it("renders CSS Grid container occupying full height below header", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.style.height).toBe(`calc(100vh - ${LAYOUT.HEADER_HEIGHT}px)`);
      expect(workspace.style.gridTemplateAreas).toContain("transport");
      expect(workspace.style.gridTemplateAreas).toContain("sidebar");
      expect(workspace.style.gridTemplateAreas).toContain("waveform");
    });

    it("applies overflow-hidden on tall+desktop viewports (no scroll)", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.className).toContain("overflow-hidden");
    });

    it("renders transport bar, sidebar, waveform, and mixer areas", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      mockWorkspaceLayout.mixerExpanded = true;
      render(<Workspace />);

      expect(screen.getByTestId("workspace-transport")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-waveform")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-mixer")).toBeInTheDocument();
    });

    it("sets sidebar width to TOOL_SIDEBAR_WIDTH constant", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      render(<Workspace />);

      const sidebar = screen.getByTestId("workspace-sidebar");
      expect(sidebar.style.width).toBe(`${LAYOUT.TOOL_SIDEBAR_WIDTH}px`);
    });

    it("shows effects panel column when tool drawer is open", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      mockToolDrawer.isOpen = true;
      mockToolDrawer.activeTool = "pitch";
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.style.gridTemplateColumns).toContain(`${LAYOUT.EFFECTS_PANEL_WIDTH}px`);
      expect(screen.getByTestId("workspace-effects")).toBeInTheDocument();

      mockToolDrawer.isOpen = false;
      mockToolDrawer.activeTool = null;
    });

    it("does not show effects panel column when drawer is closed", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      mockToolDrawer.isOpen = false;
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.style.gridTemplateColumns).not.toContain(`${LAYOUT.EFFECTS_PANEL_WIDTH}px`);
      expect(screen.queryByTestId("workspace-effects")).not.toBeInTheDocument();
    });
  });

  describe("tablet layout (768-1023px wide)", () => {
    it("uses overlay for effects panel instead of pushing", () => {
      setViewport({ desktop: false, tablet: true, tall: true });
      mockToolDrawer.isOpen = true;
      mockToolDrawer.activeTool = "eq";
      render(<Workspace />);

      // No effects column in grid
      const workspace = screen.getByTestId("workspace");
      expect(workspace.style.gridTemplateColumns).not.toContain(`${LAYOUT.EFFECTS_PANEL_WIDTH}px`);
      // But overlay exists inside waveform area
      expect(screen.getByTestId("workspace-effects-overlay")).toBeInTheDocument();

      mockToolDrawer.isOpen = false;
      mockToolDrawer.activeTool = null;
    });
  });

  describe("mobile layout (<768px wide)", () => {
    it("renders horizontal toolbar instead of vertical sidebar", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      expect(screen.getByTestId("workspace-toolbar")).toBeInTheDocument();
      expect(screen.queryByTestId("workspace-sidebar")).not.toBeInTheDocument();
    });

    it("uses single-column grid layout", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.style.gridTemplateColumns).toBe("1fr");
    });

    it("renders ToolSidebar with horizontal prop in toolbar area", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      // ToolSidebar renders inside the toolbar div
      expect(screen.getByTestId("tool-sidebar")).toBeInTheDocument();
    });

    it("renders bottom sheet when tool drawer is open on mobile", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      mockToolDrawer.isOpen = true;
      mockToolDrawer.activeTool = "eq";
      render(<Workspace />);

      expect(screen.getByTestId("effects-bottom-sheet")).toBeInTheDocument();

      mockToolDrawer.isOpen = false;
      mockToolDrawer.activeTool = null;
    });

    it("does not render bottom sheet when tool drawer is closed on mobile", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      mockToolDrawer.isOpen = false;
      mockToolDrawer.activeTool = null;
      render(<Workspace />);

      expect(screen.queryByTestId("effects-bottom-sheet")).not.toBeInTheDocument();
    });

    it("allows vertical scrolling on mobile", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.className).toContain("overflow-y-auto");
    });

    it("makes transport bar sticky on mobile", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      const transport = screen.getByTestId("workspace-transport");
      expect(transport.className).toContain("sticky");
      expect(transport.className).toContain("top-0");
      expect(transport.className).toContain("z-20");
    });

    it("waveform takes full width without sidebar space", () => {
      setViewport({ desktop: false, tablet: false, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      // Single column = full width for waveform
      expect(workspace.style.gridTemplateColumns).toBe("1fr");
      // No sidebar area in grid template
      expect(workspace.style.gridTemplateAreas).not.toContain("sidebar");
    });
  });

  describe("short viewport (<768px tall)", () => {
    it("allows vertical scrolling", () => {
      setViewport({ desktop: true, tablet: true, tall: false });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.className).toContain("overflow-y-auto");
      expect(workspace.className).not.toContain("overflow-hidden");
    });

    it("makes transport bar sticky", () => {
      setViewport({ desktop: true, tablet: true, tall: false });
      render(<Workspace />);

      const transport = screen.getByTestId("workspace-transport");
      expect(transport.className).toContain("sticky");
      expect(transport.className).toContain("top-0");
    });
  });

  describe("mixer console", () => {
    it("renders mixer area in grid layout", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      mockWorkspaceLayout.mixerExpanded = true;
      render(<Workspace />);

      expect(screen.getByTestId("workspace-mixer")).toBeInTheDocument();
    });

    it("always renders mixer grid area (MixerConsole handles collapse internally)", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      mockWorkspaceLayout.mixerExpanded = false;
      render(<Workspace />);

      // workspace-mixer grid area is always rendered; MixerConsole
      // handles its own max-height transition to 0px when collapsed
      expect(screen.getByTestId("workspace-mixer")).toBeInTheDocument();
      mockWorkspaceLayout.mixerExpanded = true;
    });
  });

  describe("dark theme styling", () => {
    it("applies dark background to workspace container", () => {
      setViewport({ desktop: true, tablet: true, tall: true });
      render(<Workspace />);

      const workspace = screen.getByTestId("workspace");
      expect(workspace.className).toContain("bg-[hsl(220,15%,8%)]");
    });
  });
});
