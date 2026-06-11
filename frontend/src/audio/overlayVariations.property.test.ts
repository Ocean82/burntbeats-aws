/**
 * Property-Based Test: Fill variation correctness (Property 8)
 *
 * Feature: rhythm-pattern-overlay
 * Property 8: Fill variation correctness
 *
 * For any VelocityPattern with S steps, applying the fill variation SHALL:
 * (a) set snare and tom hits on every step in the final 25% of steps with velocity
 *     values increasing linearly from VELOCITY_GHOST (40) to VELOCITY_ACCENT (127),
 * (b) set closed hat, open hat, and ride rows to VELOCITY_OFF in the fill region,
 * (c) leave all steps before the fill region unchanged in those rows.
 *
 * **Validates: Requirements 6.2**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applyBreakdown, applyBuildup, applyFill } from "./overlayVariations";
import type { VelocityPattern } from "./types";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_OFF } from "./types";

// Row indices (DEFAULT_KIT)
const KICK = 0;
const SNARE = 1;
const CLOSED_HAT = 2;
const OPEN_HAT = 3;
const CLAP = 4;
const RIDE = 5;
const TOM_HI = 6;
const TOM_LO = 7;

/**
 * Arbitrary generator for a VelocityPattern with 8 rows and a given step count.
 * Each cell is a random velocity value 0–127.
 */
function arbitraryVelocityPattern(
  rows: number,
  steps: number,
): fc.Arbitrary<VelocityPattern> {
  const rowArb = fc.array(fc.integer({ min: 0, max: 127 }), {
    minLength: steps,
    maxLength: steps,
  });
  return fc.array(rowArb, { minLength: rows, maxLength: rows });
}

describe("Feature: rhythm-pattern-overlay, Property 8: Fill variation correctness", () => {
  const stepCounts = [16, 32, 64] as const;
  const rows = 8;

  // Generate a pattern with a random step count from the allowed set
  const patternArb = fc
    .constantFrom(...stepCounts)
    .chain((steps) => arbitraryVelocityPattern(rows, steps));

  it("(a) snare and tom hits in final 25% have linearly increasing velocity from GHOST to ACCENT", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyFill(pattern);
        const steps = pattern[0].length;
        const fillStart = Math.floor(steps * 0.75);
        const fillLength = steps - fillStart;

        for (let i = fillStart; i < steps; i++) {
          const position = i - fillStart;
          const expectedVel = Math.round(
            VELOCITY_GHOST +
              ((VELOCITY_ACCENT - VELOCITY_GHOST) * position) /
                (fillLength - 1 || 1),
          );

          // Snare (row 1) should have the expected velocity
          expect(result[SNARE][i]).toBe(expectedVel);
          // TomHi (row 6) should have the expected velocity
          expect(result[TOM_HI][i]).toBe(expectedVel);
          // TomLo (row 7) should have the expected velocity
          expect(result[TOM_LO][i]).toBe(expectedVel);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("(b) closed hat, open hat, and ride are silenced (VELOCITY_OFF) in fill region", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyFill(pattern);
        const steps = pattern[0].length;
        const fillStart = Math.floor(steps * 0.75);

        for (let i = fillStart; i < steps; i++) {
          expect(result[CLOSED_HAT][i]).toBe(VELOCITY_OFF);
          expect(result[OPEN_HAT][i]).toBe(VELOCITY_OFF);
          expect(result[RIDE][i]).toBe(VELOCITY_OFF);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("(c) all steps before the fill region remain unchanged", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyFill(pattern);
        const steps = pattern[0].length;
        const fillStart = Math.floor(steps * 0.75);

        for (let row = 0; row < rows; row++) {
          for (let step = 0; step < fillStart; step++) {
            expect(result[row][step]).toBe(pattern[row][step]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Property-Based Test: Variation immutability and dimension preservation (Property 11)
 *
 * Feature: rhythm-pattern-overlay
 * Property 11: Variation immutability and dimension preservation
 *
 * For any VelocityPattern (including patterns with fewer than 8 rows) and any
 * variation type (fill, breakdown, buildup), applying the variation SHALL produce
 * a new VelocityPattern with the same number of rows and the same number of steps
 * per row as the input, and the original input pattern SHALL remain unmodified.
 *
 * **Validates: Requirements 6.5, 6.8**
 */

/** Step count options matching PatternLength type */
const stepCountArb = fc.constantFrom(16, 32, 64);

/**
 * Generates an arbitrary VelocityPattern with a variable number of rows (1–10)
 * and a step count from [16, 32, 64]. Each cell value is in the valid range 0–127.
 */
function arbitraryVariableRowPattern(
  minRows = 1,
  maxRows = 10,
): fc.Arbitrary<VelocityPattern> {
  return stepCountArb.chain((steps) =>
    fc
      .integer({ min: minRows, max: maxRows })
      .chain((rowCount) =>
        fc.array(
          fc.array(fc.integer({ min: 0, max: 127 }), {
            minLength: steps,
            maxLength: steps,
          }),
          { minLength: rowCount, maxLength: rowCount },
        ),
      ),
  ) as fc.Arbitrary<VelocityPattern>;
}

describe("Feature: rhythm-pattern-overlay, Property 11: Variation immutability and dimension preservation", () => {
  const variationFns = [
    { name: "applyFill", fn: applyFill },
    { name: "applyBreakdown", fn: applyBreakdown },
    { name: "applyBuildup", fn: applyBuildup },
  ] as const;

  for (const { name, fn } of variationFns) {
    it(`${name}: output has the same number of rows as input`, () => {
      fc.assert(
        fc.property(arbitraryVariableRowPattern(), (pattern) => {
          const result = fn(pattern);
          expect(result.length).toBe(pattern.length);
        }),
        { numRuns: 100 },
      );
    });

    it(`${name}: output has the same number of steps per row as input`, () => {
      fc.assert(
        fc.property(arbitraryVariableRowPattern(), (pattern) => {
          const result = fn(pattern);
          for (let row = 0; row < pattern.length; row++) {
            expect(result[row].length).toBe(pattern[row].length);
          }
        }),
        { numRuns: 100 },
      );
    });

    it(`${name}: original input pattern is not mutated`, () => {
      fc.assert(
        fc.property(arbitraryVariableRowPattern(), (pattern) => {
          // Deep clone the input before applying variation
          const originalSnapshot: VelocityPattern = pattern.map((row) => [...row]);

          fn(pattern);

          // Verify original pattern is unchanged
          expect(pattern).toEqual(originalSnapshot);
        }),
        { numRuns: 100 },
      );
    });

    it(`${name}: works correctly with patterns having fewer than 8 rows`, () => {
      const smallPatternArb = arbitraryVariableRowPattern(1, 7);

      fc.assert(
        fc.property(smallPatternArb, (pattern) => {
          const originalSnapshot: VelocityPattern = pattern.map((row) => [...row]);
          const result = fn(pattern);

          // Dimension preservation
          expect(result.length).toBe(pattern.length);
          for (let row = 0; row < pattern.length; row++) {
            expect(result[row].length).toBe(pattern[row].length);
          }

          // Immutability
          expect(pattern).toEqual(originalSnapshot);
        }),
        { numRuns: 100 },
      );
    });
  }
});


// ─── Property 9: Breakdown variation correctness ─────────────────────────────

describe("Feature: rhythm-pattern-overlay, Property 9: Breakdown variation correctness", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any VelocityPattern, applying the breakdown variation SHALL:
   * (a) set closed hat, open hat, and ride rows to VELOCITY_OFF on all steps,
   * (b) retain kick hits only on steps where `step % 8 === 0` and set all other
   *     kick steps to VELOCITY_OFF,
   * (c) retain snare hits only on steps where `step % 8 === 4` and set all other
   *     snare steps to VELOCITY_OFF, and
   * (d) set clap and tom rows to VELOCITY_OFF.
   */

  const stepCounts = [16, 32, 64] as const;
  const rows = 8;

  const patternArb = fc
    .constantFrom(...stepCounts)
    .chain((steps) => arbitraryVelocityPattern(rows, steps));

  it("(a) closed hat, open hat, and ride rows are all VELOCITY_OFF on all steps", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyBreakdown(pattern);
        const steps = pattern[0].length;

        for (let i = 0; i < steps; i++) {
          expect(result[CLOSED_HAT][i]).toBe(VELOCITY_OFF);
          expect(result[OPEN_HAT][i]).toBe(VELOCITY_OFF);
          expect(result[RIDE][i]).toBe(VELOCITY_OFF);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("(b) kick retained only on steps where step % 8 === 0, others VELOCITY_OFF", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyBreakdown(pattern);
        const steps = pattern[0].length;

        for (let i = 0; i < steps; i++) {
          if (i % 8 === 0) {
            // Kick is retained (same value as the original pattern)
            expect(result[KICK][i]).toBe(pattern[KICK][i]);
          } else {
            // Kick is silenced
            expect(result[KICK][i]).toBe(VELOCITY_OFF);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("(c) snare retained only on steps where step % 8 === 4, others VELOCITY_OFF", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyBreakdown(pattern);
        const steps = pattern[0].length;

        for (let i = 0; i < steps; i++) {
          if (i % 8 === 4) {
            // Snare is retained (same value as the original pattern)
            expect(result[SNARE][i]).toBe(pattern[SNARE][i]);
          } else {
            // Snare is silenced
            expect(result[SNARE][i]).toBe(VELOCITY_OFF);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("(d) clap and tom rows are all VELOCITY_OFF on all steps", () => {
    fc.assert(
      fc.property(patternArb, (pattern) => {
        const result = applyBreakdown(pattern);
        const steps = pattern[0].length;

        for (let i = 0; i < steps; i++) {
          expect(result[CLAP][i]).toBe(VELOCITY_OFF);
          expect(result[TOM_HI][i]).toBe(VELOCITY_OFF);
          expect(result[TOM_LO][i]).toBe(VELOCITY_OFF);
        }
      }),
      { numRuns: 100 },
    );
  });
});
