import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock useMediaQuery hook
const mockUseMediaQuery = vi.fn<(query: string) => boolean>();
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

// Mock useToolDrawer hook
const mockUseToolDrawer = vi.fn();
vi.mock("@/hooks/useToolDrawer", () => ({
  useToolDrawer: () => mockUseToolDrawer(),
}));

// Mock useWorkspaceLayout hook
const mockUseWorkspaceLayout = vi.fn();
vi.mock("@/hooks/useWorkspaceLayout", () => ({
  useWorkspaceLayout: () => mockUseWorkspaceLayout(),
}));

// Mock WorkflowContext
vi.mock("@/contexts/WorkflowContext", () => ({
  useWorkflow: () => ({
    stemStates: {
      "stem-1": {
        pitchSemitones: 0,
        timeStretch: 1,
        fadeIn: 0,
        fadeOut: 0,
        mixer: {
          gain: 0,
          pan: 0,
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
          reverbWet: 0,
          delayWet: 0,
        },
      },
    },
    setStemStates: vi.fn(),
  }),
}));

// Mock AudioContext
vi.mock("@/contexts/AudioContext", () => ({
  useAudio: () => ({
    isPlayingMix: false,
    handlePlayMix: vi.fn(),
    handleStopMix: vi.fn(),
    handleSeek: vi.fn(),
    playbackPosition: 0,
    duration: 0,
    stemBuffers: {},
    setStemBuffers: vi.fn(),
    isLoadingStems: false,
    loadingError: null,
    retryLoadStems: vi.fn(),
    clearStemLoadingState: vi.fn(),
    applyMasterEq: vi.fn(),
    applyMasterCompressor: vi.fn(),
    getPlayheadPosition: vi.fn(() => 0),
    subscribePlayheadPosition: vi.fn(() => vi.fn()),
    handleSeekMix: vi.fn(),
    masterVolume: 1,
    setMasterVolume: vi.fn(),
    masterLimiterEnabled: false,
    setMasterLimiterEnabled: vi.fn(),
    setLoopEnabled: vi.fn(),
    isPlaying: false,
    loopEnabled: false,
  }),
}));

// Mock framer-motion AnimatePresence to render children directly
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      onTouchStart,
      onTouchEnd,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      return (
        <div
          {...rest}
          onTouchStart={onTouchStart as React.TouchEventHandler}
          onTouchEnd={onTouchEnd as React.TouchEventHandler}
        >
          {children}
        </div>
      );
    },
  },
  useReducedMotion: () => false,
}));

// Mock EffectsPanel used inside EffectsPanelBottomSheet
vi.mock("./EffectsPanel", () => ({
  EffectsPanel: ({ activeTool }: Record<string, unknown>) => (
    <div data-testid="effects-panel" data-tool={activeTool as string}>
      Effects Panel
    </div>
  ),
}));

import { Workspace } from "./Workspace";
import { LAYOUT } from "@/constants/layout";

/**
 * Helper to configure media query mock for a given viewport scenario.
 * The Workspace calls useMediaQuery with:
 *   - `(min-width: 1024px)` → isDesktop
 *   - `(min-width: 768px)` → isTablet
 *   - `(min-height: 768px)` → isTallViewport
 */
function setViewport(scenario: "mobile" | "tablet" | "desktop") {
  mockUseMediaQuery.mockImplementation((query: string) => {
    if (query === `(min-width: ${LAYOUT.BREAKPOINT_DESKTOP}px)`) {
      return scenario === "desktop";
    }
    if (query === `(min-width: ${LAYOUT.BREAKPOINT_TABLET}px)`) {
      return scenario === "tablet" || scenario === "desktop";
    }
    if (query === `(min-height: ${LAYOUT.BREAKPOINT_TABLET}px)`) {
      return true; // tall viewport by default
    }
    return false;
  });
}

describe("Workspace responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no tool active, mixer collapsed
    mockUseToolDrawer.mockReturnValue({
      isOpen: false,
      activeTool: null,
      toggle: vi.fn(),
      close: vi.fn(),
    });
    mockUseWorkspaceLayout.mockReturnValue({
      mixerExpanded: false,
      toggleMixer: vi.fn(),
      viewportSize: { width: 1024, height: 768 },
    });
  });

  describe("Mobile (< 768px) - Req 10.1: ToolSidebar horizontal toolbar", () => {
    beforeEach(() => {
      setViewport("mobile");
    });

    it("renders workspace-toolbar area with ToolSidebar in horizontal mode", () => {
      render(<Workspace />);

      const toolbar = screen.getByTestId("workspace-toolbar");
      expect(toolbar).toBeInTheDocument();

      // ToolSidebar rendered inside toolbar with horizontal prop
      const sidebar = screen.getByTestId("tool-sidebar");
      expect(sidebar).toBeInTheDocument();
      expect(sidebar.className).toContain("flex-row");
    });

    it("does NOT render workspace-sidebar area at mobile sizes", () => {
      render(<Workspace />);

      expect(screen.queryByTestId("workspace-sidebar")).not.toBeInTheDocument();
    });
  });

  describe("Mobile (< 768px) - Req 10.2: EffectsPanel bottom sheet", () => {
    beforeEach(() => {
      setViewport("mobile");
      mockUseToolDrawer.mockReturnValue({
        isOpen: true,
        activeTool: "eq",
        toggle: vi.fn(),
        close: vi.fn(),
      });
    });

    it("renders EffectsPanelBottomSheet when a tool is active", () => {
      render(<Workspace />);

      expect(screen.getByTestId("effects-bottom-sheet")).toBeInTheDocument();
    });

    it("does NOT render workspace-effects (desktop push column)", () => {
      render(<Workspace />);

      expect(screen.queryByTestId("workspace-effects")).not.toBeInTheDocument();
    });

    it("does NOT render workspace-effects-overlay (tablet overlay)", () => {
      render(<Workspace />);

      expect(
        screen.queryByTestId("workspace-effects-overlay"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Tablet (768-1023px) - Req 5.6: EffectsPanel overlay mode", () => {
    beforeEach(() => {
      setViewport("tablet");
      mockUseToolDrawer.mockReturnValue({
        isOpen: true,
        activeTool: "pitch",
        toggle: vi.fn(),
        close: vi.fn(),
      });
    });

    it("renders workspace-effects-overlay when a tool is active", () => {
      render(<Workspace />);

      expect(
        screen.getByTestId("workspace-effects-overlay"),
      ).toBeInTheDocument();
    });

    it("does NOT render workspace-effects (desktop push column)", () => {
      render(<Workspace />);

      expect(screen.queryByTestId("workspace-effects")).not.toBeInTheDocument();
    });

    it("does NOT render EffectsPanelBottomSheet (mobile bottom sheet)", () => {
      render(<Workspace />);

      expect(
        screen.queryByTestId("effects-bottom-sheet"),
      ).not.toBeInTheDocument();
    });

    it("renders workspace-sidebar (vertical ToolSidebar)", () => {
      render(<Workspace />);

      expect(screen.getByTestId("workspace-sidebar")).toBeInTheDocument();
      expect(screen.queryByTestId("workspace-toolbar")).not.toBeInTheDocument();
    });
  });
});
