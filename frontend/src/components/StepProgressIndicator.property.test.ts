import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { deriveSteps } from "./StepProgressIndicator";
import type { AppPhase } from "@/types/phases";

/**
 * Feature: stem-editor-transitional-ui, Property 5: Step indicator state derivation
 *
 * Validates: Requirements 7.5
 *
 * For any valid AppPhase, the step progress indicator SHALL derive its visual states
 * deterministically: all phases preceding the current phase in the ordered sequence
 * [upload, configure, splitting, workspace] SHALL be marked "completed", the current
 * phase SHALL be marked "active", and all subsequent phases SHALL be marked "upcoming".
 */

const PHASE_ORDER: AppPhase[] = ["upload", "configure", "splitting", "workspace"];

const PHASE_LABELS: Record<AppPhase, string> = {
  upload: "Upload",
  configure: "Configure",
  splitting: "Splitting",
  workspace: "Workspace",
};

const phaseArb = fc.constantFrom<AppPhase>("upload", "configure", "splitting", "workspace");

describe("Property 5: Step indicator state derivation", () => {
  it("preceding phases are 'completed', current is 'active', subsequent are 'upcoming'", () => {
    fc.assert(
      fc.property(phaseArb, (phase: any) => {
        const steps = deriveSteps(phase);
        const currentIndex = PHASE_ORDER.indexOf(phase);

        // All steps before current index should be "completed"
        for (let i = 0; i < currentIndex; i++) {
          expect(steps[i].state).toBe("completed");
        }

        // Current step should be "active"
        expect(steps[currentIndex].state).toBe("active");

        // All steps after current index should be "upcoming"
        for (let i = currentIndex + 1; i < PHASE_ORDER.length; i++) {
          expect(steps[i].state).toBe("upcoming");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("step ids match the ordered phase sequence", () => {
    fc.assert(
      fc.property(phaseArb, (phase: any) => {
        const steps = deriveSteps(phase);

        expect(steps.map((s) => s.id)).toEqual(PHASE_ORDER);
      }),
      { numRuns: 100 },
    );
  });

  it("step labels match their designated human-readable names", () => {
    fc.assert(
      fc.property(phaseArb, (phase: any) => {
        const steps = deriveSteps(phase);

        for (const step of steps) {
          expect(step.label).toBe(PHASE_LABELS[step.id]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("always returns exactly 4 steps", () => {
    fc.assert(
      fc.property(phaseArb, (phase: any) => {
        const steps = deriveSteps(phase);
        expect(steps).toHaveLength(4);
      }),
      { numRuns: 100 },
    );
  });
});
