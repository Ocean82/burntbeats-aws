/**
 * Property-Based Test: Tool-to-controls mapping (Property 4)
 *
 * Feature: stem-editor-transitional-ui, Property 4: Tool-to-controls mapping
 *
 * For any random tool category, the EffectsPanel renders ONLY the correct control set
 * (identified by data-testid) and NO controls from other tool categories appear in the DOM.
 *
 * **Validates: Requirements 5.5**
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { EffectsPanel } from "./EffectsPanel";
import type { ToolCategory } from "@/types/tools";
import { defaultStemState } from "@/stem-editor-state";

// Mock framer-motion to avoid animation complexities in tests
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

// Mock WorkflowContext with a stem entry so controls render
const STEM_ID = "test-stem-1";
vi.mock("@/contexts/WorkflowContext", () => ({
  useWorkflow: () => ({
    stemStates: { [STEM_ID]: defaultStemState() },
    setStemStates: vi.fn(),
  }),
}));

const TOOL_CATEGORIES: ToolCategory[] = ["pitch", "eq", "timeStretch", "amplitude", "fx"];

/** Maps each tool category to the data-testid of its rendered control set */
const TOOL_TESTID_MAP: Record<ToolCategory, string> = {
  pitch: "pitch-controls",
  eq: "eq-controls",
  timeStretch: "time-stretch-controls",
  amplitude: "amplitude-controls",
  fx: "fx-controls",
};

/** Arbitrary for a single tool category */
const toolCategoryArb = fc.constantFrom<ToolCategory>(...TOOL_CATEGORIES);

describe("Feature: stem-editor-transitional-ui, Property 4: Tool-to-controls mapping", () => {
  it("renders only the correct control set for any random tool category", () => {
    fc.assert(
      fc.property(toolCategoryArb, (tool) => {
        const { unmount } = render(
          <EffectsPanel
            activeTool={tool}
            onClose={vi.fn()}
            isOverlay={true}
            activeStemId={STEM_ID}
          />,
        );

        // The correct control set MUST be present
        const expectedTestId = TOOL_TESTID_MAP[tool];
        expect(screen.getByTestId(expectedTestId)).toBeDefined();

        // No controls from OTHER tool categories should appear
        const otherTools = TOOL_CATEGORIES.filter((t) => t !== tool);
        for (const otherTool of otherTools) {
          const otherTestId = TOOL_TESTID_MAP[otherTool];
          expect(screen.queryByTestId(otherTestId)).toBeNull();
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("every tool category maps to exactly one distinct control set", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(toolCategoryArb, { minLength: 2, maxLength: 5 }),
        (tools) => {
          // Each tool should map to a different testid
          const testIds = tools.map((t) => TOOL_TESTID_MAP[t]);
          const uniqueIds = new Set(testIds);
          expect(uniqueIds.size).toBe(tools.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rendered control set always corresponds to the activeTool prop", () => {
    fc.assert(
      fc.property(toolCategoryArb, (tool) => {
        const { unmount, container } = render(
          <EffectsPanel
            activeTool={tool}
            onClose={vi.fn()}
            isOverlay={true}
            activeStemId={STEM_ID}
          />,
        );

        // Exactly one control set is present in the DOM
        const allControlTestIds = Object.values(TOOL_TESTID_MAP);
        const presentControls = allControlTestIds.filter(
          (testId) => container.querySelector(`[data-testid="${testId}"]`) !== null,
        );

        expect(presentControls).toHaveLength(1);
        expect(presentControls[0]).toBe(TOOL_TESTID_MAP[tool]);

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
