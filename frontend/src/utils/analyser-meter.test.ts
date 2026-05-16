import { describe, expect, it } from "vitest";
import {
  computeTimeDomainPeak,
  computeTimeDomainRms,
  METER_CLIP_PEAK_THRESHOLD,
  rmsToMeterLevel,
} from "./analyser-meter";

describe("analyser-meter", () => {
  it("computes peak near full scale for hot signal", () => {
    const hot = new Uint8Array(256).fill(255);
    expect(computeTimeDomainPeak(hot)).toBeGreaterThanOrEqual(METER_CLIP_PEAK_THRESHOLD);
  });

  it("computes low peak for silence", () => {
    const silent = new Uint8Array(256).fill(128);
    expect(computeTimeDomainPeak(silent)).toBeLessThan(0.01);
  });

  it("rmsToMeterLevel caps at 1", () => {
    expect(rmsToMeterLevel(1)).toBe(1);
    expect(computeTimeDomainRms(new Uint8Array(256).fill(128))).toBe(0);
  });
});
