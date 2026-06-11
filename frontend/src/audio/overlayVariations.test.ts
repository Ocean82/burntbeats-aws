/**
 * Unit tests for overlayVariations — verifies the three overlay variation
 * generator functions (applyFill, applyBreakdown, applyBuildup).
 */
import { describe, expect, it } from "vitest";
import { applyBreakdown, applyBuildup, applyFill, applyOverlayVariation } from "./overlayVariations";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_NORMAL, VELOCITY_OFF } from "./types";
import type { VelocityPattern } from "./types";

// Helper: create an 8-row pattern filled with a given value
function makePattern(rows: number, steps: number, fill = VELOCITY_NORMAL): VelocityPattern {
  return Array.from({ length: rows }, () => Array(steps).fill(fill));
}

describe("applyFill", () => {
  it("leaves steps before fillStart unchanged", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const result = applyFill(input);
    const fillStart = Math.floor(16 * 0.75); // 12

    for (let row = 0; row < 8; row++) {
      for (let step = 0; step < fillStart; step++) {
        expect(result[row][step]).toBe(VELOCITY_NORMAL);
      }
    }
  });

  it("sets snare/tomHi/tomLo velocity from GHOST to ACCENT in fill region", () => {
    const input = makePattern(8, 16, VELOCITY_OFF);
    const result = applyFill(input);
    const fillStart = Math.floor(16 * 0.75);

    // First fill step should be VELOCITY_GHOST
    expect(result[1][fillStart]).toBe(VELOCITY_GHOST);
    expect(result[6][fillStart]).toBe(VELOCITY_GHOST);
    expect(result[7][fillStart]).toBe(VELOCITY_GHOST);

    // Last fill step should be VELOCITY_ACCENT
    expect(result[1][15]).toBe(VELOCITY_ACCENT);
    expect(result[6][15]).toBe(VELOCITY_ACCENT);
    expect(result[7][15]).toBe(VELOCITY_ACCENT);
  });

  it("silences closedHat, openHat, ride in fill region", () => {
    const input = makePattern(8, 16, VELOCITY_ACCENT);
    const result = applyFill(input);
    const fillStart = Math.floor(16 * 0.75);

    for (let step = fillStart; step < 16; step++) {
      expect(result[2][step]).toBe(VELOCITY_OFF);
      expect(result[3][step]).toBe(VELOCITY_OFF);
      expect(result[5][step]).toBe(VELOCITY_OFF);
    }
  });

  it("does not mutate the input pattern", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const inputCopy = input.map((row) => [...row]);
    applyFill(input);
    expect(input).toEqual(inputCopy);
  });

  it("preserves dimensions of the output", () => {
    const input = makePattern(8, 32, VELOCITY_NORMAL);
    const result = applyFill(input);
    expect(result.length).toBe(8);
    expect(result[0].length).toBe(32);
  });
});

describe("applyBreakdown", () => {
  it("silences all cymbals (closedHat, openHat, ride)", () => {
    const input = makePattern(8, 16, VELOCITY_ACCENT);
    const result = applyBreakdown(input);

    for (let step = 0; step < 16; step++) {
      expect(result[2][step]).toBe(VELOCITY_OFF);
      expect(result[3][step]).toBe(VELOCITY_OFF);
      expect(result[5][step]).toBe(VELOCITY_OFF);
    }
  });

  it("retains kick only on steps divisible by 8", () => {
    const input = makePattern(8, 16, VELOCITY_ACCENT);
    const result = applyBreakdown(input);

    for (let step = 0; step < 16; step++) {
      if (step % 8 === 0) {
        expect(result[0][step]).toBe(VELOCITY_ACCENT);
      } else {
        expect(result[0][step]).toBe(VELOCITY_OFF);
      }
    }
  });

  it("retains snare only on steps where step%8===4", () => {
    const input = makePattern(8, 16, VELOCITY_ACCENT);
    const result = applyBreakdown(input);

    for (let step = 0; step < 16; step++) {
      if (step % 8 === 4) {
        expect(result[1][step]).toBe(VELOCITY_ACCENT);
      } else {
        expect(result[1][step]).toBe(VELOCITY_OFF);
      }
    }
  });

  it("sets clap and toms to VELOCITY_OFF", () => {
    const input = makePattern(8, 16, VELOCITY_ACCENT);
    const result = applyBreakdown(input);

    for (let step = 0; step < 16; step++) {
      expect(result[4][step]).toBe(VELOCITY_OFF);
      expect(result[6][step]).toBe(VELOCITY_OFF);
      expect(result[7][step]).toBe(VELOCITY_OFF);
    }
  });

  it("does not mutate the input pattern", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const inputCopy = input.map((row) => [...row]);
    applyBreakdown(input);
    expect(input).toEqual(inputCopy);
  });
});

describe("applyBuildup", () => {
  it("sets closed hi-hat on every step with velocity 40→100", () => {
    const input = makePattern(8, 16, VELOCITY_OFF);
    const result = applyBuildup(input);

    // First step: VELOCITY_GHOST
    expect(result[2][0]).toBe(VELOCITY_GHOST);
    // Last step: VELOCITY_NORMAL
    expect(result[2][15]).toBe(VELOCITY_NORMAL);
    // All steps should have a value
    for (let step = 0; step < 16; step++) {
      expect(result[2][step]).toBeGreaterThanOrEqual(VELOCITY_GHOST);
      expect(result[2][step]).toBeLessThanOrEqual(VELOCITY_NORMAL);
    }
  });

  it("adds snare ghost notes every 4 steps in first half", () => {
    const input = makePattern(8, 16, VELOCITY_OFF);
    const result = applyBuildup(input);
    const half = Math.floor(16 / 2); // 8

    for (let step = 0; step < half; step++) {
      if (step % 4 === 0) {
        expect(result[1][step]).toBeGreaterThanOrEqual(VELOCITY_GHOST);
      } else {
        expect(result[1][step]).toBe(VELOCITY_OFF);
      }
    }
  });

  it("adds snare ghost notes every 2 steps in second half", () => {
    const input = makePattern(8, 16, VELOCITY_OFF);
    const result = applyBuildup(input);
    const half = Math.floor(16 / 2); // 8

    for (let step = half; step < 16; step++) {
      if (step % 2 === 0) {
        expect(result[1][step]).toBeGreaterThanOrEqual(VELOCITY_GHOST);
        expect(result[1][step]).toBeLessThanOrEqual(VELOCITY_NORMAL);
      } else {
        expect(result[1][step]).toBe(VELOCITY_OFF);
      }
    }
  });

  it("snare velocity rises from GHOST to NORMAL across the pattern", () => {
    const input = makePattern(8, 32, VELOCITY_OFF);
    const result = applyBuildup(input);

    // First snare hit at step 0 should be VELOCITY_GHOST
    expect(result[1][0]).toBe(VELOCITY_GHOST);
    // Last snare hit (step 30 in second half, step%2===0) should be near VELOCITY_NORMAL
    expect(result[1][30]).toBeGreaterThan(VELOCITY_GHOST);
    expect(result[1][30]).toBeLessThanOrEqual(VELOCITY_NORMAL);
  });

  it("does not mutate the input pattern", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const inputCopy = input.map((row) => [...row]);
    applyBuildup(input);
    expect(input).toEqual(inputCopy);
  });
});

describe("graceful handling of patterns with fewer than 8 rows", () => {
  it("applyFill works with 4 rows", () => {
    const input = makePattern(4, 16, VELOCITY_NORMAL);
    const result = applyFill(input);
    expect(result.length).toBe(4);
    expect(result[0].length).toBe(16);
    // Snare (row 1) still gets fill
    expect(result[1][12]).toBeGreaterThanOrEqual(VELOCITY_GHOST);
    // closedHat (row 2) silenced in fill
    expect(result[2][12]).toBe(VELOCITY_OFF);
    // openHat (row 3) silenced in fill
    expect(result[3][12]).toBe(VELOCITY_OFF);
  });

  it("applyBreakdown works with 3 rows", () => {
    const input = makePattern(3, 16, VELOCITY_ACCENT);
    const result = applyBreakdown(input);
    expect(result.length).toBe(3);
    // kick (row 0): retained on steps divisible by 8
    expect(result[0][0]).toBe(VELOCITY_ACCENT);
    expect(result[0][1]).toBe(VELOCITY_OFF);
    // snare (row 1): retained on step%8===4
    expect(result[1][4]).toBe(VELOCITY_ACCENT);
    expect(result[1][3]).toBe(VELOCITY_OFF);
    // closedHat (row 2): silenced
    expect(result[2][0]).toBe(VELOCITY_OFF);
  });

  it("applyBuildup works with 2 rows", () => {
    const input = makePattern(2, 16, VELOCITY_OFF);
    const result = applyBuildup(input);
    expect(result.length).toBe(2);
    // Only snare (row 1) affected since closedHat (row 2) doesn't exist
    expect(result[1][0]).toBe(VELOCITY_GHOST);
  });

  it("all variations work with empty pattern (0 rows)", () => {
    const input: VelocityPattern = [];
    expect(applyFill(input)).toEqual([]);
    expect(applyBreakdown(input)).toEqual([]);
    expect(applyBuildup(input)).toEqual([]);
  });

  it("all variations work with 0-step rows", () => {
    const input: VelocityPattern = [[], [], [], [], [], [], [], []];
    const fillResult = applyFill(input);
    const breakdownResult = applyBreakdown(input);
    const buildupResult = applyBuildup(input);
    expect(fillResult.length).toBe(8);
    expect(breakdownResult.length).toBe(8);
    expect(buildupResult.length).toBe(8);
  });
});

describe("applyOverlayVariation", () => {
  it("dispatches to applyFill for 'fill' type", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const result = applyOverlayVariation(input, "fill");
    expect(result).toEqual(applyFill(input));
  });

  it("dispatches to applyBreakdown for 'breakdown' type", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const result = applyOverlayVariation(input, "breakdown");
    expect(result).toEqual(applyBreakdown(input));
  });

  it("dispatches to applyBuildup for 'buildup' type", () => {
    const input = makePattern(8, 16, VELOCITY_NORMAL);
    const result = applyOverlayVariation(input, "buildup");
    expect(result).toEqual(applyBuildup(input));
  });
});
