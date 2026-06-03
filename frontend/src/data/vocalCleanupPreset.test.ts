import { describe, expect, it } from "vitest";
import {
  createVocalCleanupPreset,
  vocalCleanupVocalsMixer,
} from "./vocalCleanupPreset";

describe("vocalCleanupPreset", () => {
  it("enables transparent vocal compression", () => {
    expect(vocalCleanupVocalsMixer.compRatio).toBeGreaterThan(1);
    expect(vocalCleanupVocalsMixer.compThreshold).toBeLessThan(0);
  });

  it("cuts mud and boosts presence", () => {
    expect(vocalCleanupVocalsMixer.eqLow).toBeLessThan(0);
    expect(vocalCleanupVocalsMixer.eqLowMid).toBeLessThan(0);
    expect(vocalCleanupVocalsMixer.eqMid).toBeGreaterThan(0);
    expect(vocalCleanupVocalsMixer.presence).toBeGreaterThan(0);
  });

  it("trims hot input gain", () => {
    expect(vocalCleanupVocalsMixer.gain).toBeLessThanOrEqual(-6);
  });

  it("includes vocals stem in full preset", () => {
    const preset = createVocalCleanupPreset();
    expect(preset.mixerState.vocals).toEqual(vocalCleanupVocalsMixer);
    expect(preset.id).toBe("vocal-cleanup");
  });
});
