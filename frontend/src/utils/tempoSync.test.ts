import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYBACK_BPM,
  noteDurationSeconds,
  resolvePlaybackBpm,
} from "./tempoSync";

describe("noteDurationSeconds", () => {
  it("returns quarter note duration at 120 BPM", () => {
    expect(noteDurationSeconds(120, "4n")).toBeCloseTo(0.5, 4);
  });

  it("returns eighth note duration at 120 BPM", () => {
    expect(noteDurationSeconds(120, "8n")).toBeCloseTo(0.25, 4);
  });

  it("matches legacy hardcoded delay at 80 BPM", () => {
    expect(noteDurationSeconds(80, "8n")).toBeCloseTo(0.375, 4);
  });

  it("falls back to default BPM when invalid", () => {
    const fallback = noteDurationSeconds(DEFAULT_PLAYBACK_BPM, "8n");
    expect(noteDurationSeconds(0, "8n")).toBeCloseTo(fallback, 4);
  });
});

describe("resolvePlaybackBpm", () => {
  it("clamps to safe range", () => {
    expect(resolvePlaybackBpm(999)).toBe(300);
    expect(resolvePlaybackBpm(10)).toBe(40);
  });

  it("uses default when missing", () => {
    expect(resolvePlaybackBpm(null)).toBe(DEFAULT_PLAYBACK_BPM);
  });
});
