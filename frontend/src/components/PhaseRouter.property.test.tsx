/**
 * Property-Based Test: Phase exclusivity (Property 2)
 *
 * Feature: stem-editor-transitional-ui
 * Property 2: Phase exclusivity
 *
 * For any valid AppPhase value, the PhaseRouter SHALL render only the UI elements
 * designated for that phase and SHALL not render elements belonging to any other phase.
 * Specifically: upload → only data-testid="upload-phase", configure → only
 * data-testid="configure-phase", splitting → only data-testid="splitting-phase",
 * workspace → only data-testid="workspace-phase".
 *
 * **Validates: Requirements 2.7, 6.2**
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { PropsWithChildren, ComponentPropsWithoutRef } from "react";
import * as fc from "fast-check";
import { PhaseRouter, type PhaseRouterProps } from "./PhaseRouter";
import type { AppPhase } from "@/types/phases";

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

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// Mock Workspace to avoid WorkflowContext dependency
vi.mock("./workspace/Workspace", () => ({
  Workspace: () => <div data-testid="workspace-phase">Workspace Mock</div>,
}));

const ALL_PHASES: AppPhase[] = ["upload", "configure", "splitting", "workspace"];

const PHASE_TEST_IDS: Record<AppPhase, string> = {
  upload: "upload-phase",
  configure: "configure-phase",
  splitting: "splitting-phase",
  workspace: "workspace-phase",
};

/** Arbitrary for a valid AppPhase */
const appPhaseArb = fc.constantFrom<AppPhase>(...ALL_PHASES);

function buildProps(phase: AppPhase): PhaseRouterProps {
  return {
    phase,
    transitionTo: vi.fn(),
    error: null,
    setError: vi.fn(),
    onFileAccepted: vi.fn(),
    fileName: "test-track.wav",
    onConfigure: vi.fn(),
    progress: 0,
    onRetry: vi.fn(),
    estimatedSeconds: null,
  };
}

describe("Feature: stem-editor-transitional-ui, Property 2: Phase exclusivity", () => {
  it("renders only the designated phase component and no elements from other phases", () => {
    fc.assert(
      fc.property(appPhaseArb, (phase) => {
        const { unmount } = render(<PhaseRouter {...buildProps(phase)} />);

        // The current phase's test ID MUST be present
        expect(screen.getByTestId(PHASE_TEST_IDS[phase])).toBeInTheDocument();

        // All other phases' test IDs MUST NOT be present
        const otherPhases = ALL_PHASES.filter((p) => p !== phase);
        for (const other of otherPhases) {
          expect(
            screen.queryByTestId(PHASE_TEST_IDS[other]),
          ).not.toBeInTheDocument();
        }

        // Cleanup to avoid DOM leaks between iterations
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
