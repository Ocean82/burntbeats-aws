/**
 * Property-Based Tests for PatternLibraryPanel
 *
 * Feature: rhythm-pattern-overlay
 *
 * Property 3: Single selection invariant
 *
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { render, cleanup } from "@testing-library/react";
import { PatternLibraryPanel } from "./PatternLibraryPanel";
import { getValidPresets } from "../../audio/genrePresets";

// ─── Generators ───────────────────────────────────────────────────

/** Get all valid preset IDs from the actual library */
const validPresets = getValidPresets();
const validPatternIds = validPresets.map((p) => p.id);

/**
 * Generates an arbitrary pattern ID that may or may not exist in the library.
 * This covers both matching and non-matching IDs.
 */
const arbitraryPatternId = fc.oneof(
  // Valid preset IDs (will match displayed patterns)
  fc.constantFrom(...validPatternIds),
  // Random strings that won't match any preset
  fc.string({ minLength: 1, maxLength: 30 }),
  // Null (no selection)
  fc.constant(null as string | null),
);

/**
 * Generates an arbitrary sequence of pattern selections (IDs or null).
 * These simulate a user selecting different patterns over time.
 */
const arbitrarySelectionSequence = fc.array(arbitraryPatternId, {
  minLength: 1,
  maxLength: 10,
});

// ─── Property 3: Single selection invariant ───────────────────────

describe("Feature: rhythm-pattern-overlay, Property 3: Single selection invariant", () => {
  it("at most one pattern entry has aria-selected=true for any activePatternId value", () => {
    fc.assert(
      fc.property(arbitraryPatternId, (activePatternId: any) => {
        cleanup();
        const { container } = render(
          <PatternLibraryPanel
            onPatternSelect={vi.fn()}
            activePatternId={activePatternId}
            onVariationApply={vi.fn()}
            activeVariation={null}
          />,
        );

        const selectedEntries = container.querySelectorAll('[aria-selected="true"]');
        // Invariant: at most one entry is selected
        expect(selectedEntries.length).toBeLessThanOrEqual(1);

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("if activePatternId matches a displayed pattern, exactly one entry is selected", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validPatternIds),
        (activePatternId: any) => {
          cleanup();
          const { container } = render(
            <PatternLibraryPanel
              onPatternSelect={vi.fn()}
              activePatternId={activePatternId}
              onVariationApply={vi.fn()}
              activeVariation={null}
            />,
          );

          const selectedEntries = container.querySelectorAll('[aria-selected="true"]');
          // Exactly one entry should be selected when the ID matches
          expect(selectedEntries.length).toBe(1);

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("the selected entry corresponds to the most recently provided activePatternId", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validPatternIds),
        (activePatternId: any) => {
          cleanup();
          const { container } = render(
            <PatternLibraryPanel
              onPatternSelect={vi.fn()}
              activePatternId={activePatternId}
              onVariationApply={vi.fn()}
              activeVariation={null}
            />,
          );

          const selectedEntries = container.querySelectorAll('[aria-selected="true"]');
          expect(selectedEntries.length).toBe(1);

          // Find the pattern name in the selected entry - the preset's name should appear
          const matchingPreset = validPresets.find((p) => p.id === activePatternId);
          expect(matchingPreset).toBeDefined();
          expect(selectedEntries[0].textContent).toContain(matchingPreset!.name);

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("for any sequence of pattern selections, the final render shows at most one selected entry matching the last selection", () => {
    fc.assert(
      fc.property(arbitrarySelectionSequence, (selections: any) => {
        const lastSelection = selections[selections.length - 1];

        // Simulate the sequence: render with each selection, but only final state matters
        // (React re-renders are synchronous with the prop change)
        cleanup();
        const { container, rerender } = render(
          <PatternLibraryPanel
            onPatternSelect={vi.fn()}
            activePatternId={selections[0]}
            onVariationApply={vi.fn()}
            activeVariation={null}
          />,
        );

        // Re-render with each subsequent selection
        for (let i = 1; i < selections.length; i++) {
          rerender(
            <PatternLibraryPanel
              onPatternSelect={vi.fn()}
              activePatternId={selections[i]}
              onVariationApply={vi.fn()}
              activeVariation={null}
            />,
          );
        }

        const selectedEntries = container.querySelectorAll('[aria-selected="true"]');

        // Invariant: at most one entry is selected
        expect(selectedEntries.length).toBeLessThanOrEqual(1);

        // If the last selection matches a displayed pattern, exactly one is selected
        const matchesDisplayed = validPatternIds.includes(lastSelection as string);
        if (matchesDisplayed) {
          expect(selectedEntries.length).toBe(1);
          const matchingPreset = validPresets.find((p) => p.id === lastSelection);
          expect(selectedEntries[0].textContent).toContain(matchingPreset!.name);
        } else {
          // If it doesn't match, no entry should be selected
          expect(selectedEntries.length).toBe(0);
        }

        cleanup();
      }),
      { numRuns: 20 },
    );
  });
});
