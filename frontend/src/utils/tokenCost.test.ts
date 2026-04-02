import { describe, expect, it } from "vitest";
import { computeTokensFromDurationSeconds } from "./tokenCost";

describe("computeTokensFromDurationSeconds", () => {
  it("returns null for missing or non-positive values", () => {
    expect(computeTokensFromDurationSeconds(undefined)).toBeNull();
    expect(computeTokensFromDurationSeconds(null)).toBeNull();
    expect(computeTokensFromDurationSeconds(0)).toBeNull();
    expect(computeTokensFromDurationSeconds(-1)).toBeNull();
    expect(computeTokensFromDurationSeconds(Number.NaN)).toBeNull();
    expect(computeTokensFromDurationSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("rounds partial minutes up with minimum of one token", () => {
    expect(computeTokensFromDurationSeconds(1)).toBe(1);
    expect(computeTokensFromDurationSeconds(59.9)).toBe(1);
    expect(computeTokensFromDurationSeconds(60)).toBe(1);
    expect(computeTokensFromDurationSeconds(60.01)).toBe(2);
    expect(computeTokensFromDurationSeconds(119.99)).toBe(2);
    expect(computeTokensFromDurationSeconds(120)).toBe(2);
    expect(computeTokensFromDurationSeconds(121)).toBe(3);
  });
});
