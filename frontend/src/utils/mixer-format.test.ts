import { describe, expect, it } from "vitest";
import {
  clampMixerGainDb,
  formatDb,
  formatPan,
  MIXER_GAIN_DB_MAX,
  MIXER_GAIN_DB_MIN,
} from "./mixer-format";

describe("formatDb", () => {
  it("prefixes non-negative values with +", () => {
    expect(formatDb(0)).toBe("+0.0");
    expect(formatDb(3.5)).toBe("+3.5");
  });

  it("formats negative values without +", () => {
    expect(formatDb(-6.5)).toBe("-6.5");
  });
});

describe("formatPan", () => {
  it("shows center at zero", () => {
    expect(formatPan(0)).toBe("C");
  });

  it("shows left and right labels", () => {
    expect(formatPan(-32)).toBe("L32");
    expect(formatPan(45)).toBe("R45");
  });
});

describe("clampMixerGainDb", () => {
  it("clamps to mixer fader range", () => {
    expect(clampMixerGainDb(99)).toBe(MIXER_GAIN_DB_MAX);
    expect(clampMixerGainDb(-99)).toBe(MIXER_GAIN_DB_MIN);
    expect(clampMixerGainDb(0)).toBe(0);
  });
});
