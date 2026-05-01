import { describe, expect, it } from "vitest";
import { computeBeatGridPcts, decayPeak } from "./beatGrid";

describe("computeBeatGridPcts", () => {
  const baseGrid = { bpm: 120, beat_offset_seconds: 0, confidence: 0.9 };

  it("returns empty array when maxDuration is zero", () => {
    expect(computeBeatGridPcts({ beatGrid: baseGrid, maxDuration: 0, scrollPct: 0, zoom: 1 })).toEqual([]);
  });

  it("returns beat positions for a 4-second track at 120 BPM, offset 0", () => {
    // 120 BPM => 0.5s per beat. In 4 seconds: beats at 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.0
    const result = computeBeatGridPcts({
      beatGrid: baseGrid,
      maxDuration: 4,
      scrollPct: 0,
      zoom: 1,
    });
    // 9 beats (including boundary at 4.0s) => positions at 0%, 12.5%, ..., 100%
    expect(result).toHaveLength(9);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[1]).toBeCloseTo(12.5, 5);
    expect(result[8]).toBeCloseTo(100, 5);
  });

  it("correctly handles non-zero beat offset", () => {
    // Beat starts at 1 second. 120 BPM => 0.5s per beat. Track is 6 seconds.
    // Beats at: 1 + i*0.5 for i=-2 gives 0, i=-1 gives 0.5, i=0 gives 1, etc.
    const result = computeBeatGridPcts({
      beatGrid: { bpm: 120, beat_offset_seconds: 1, confidence: 0.85 },
      maxDuration: 6,
      scrollPct: 0,
      zoom: 1,
    });
    // First beat that falls in [0, 6] is at t=0 (index -2 from offset)
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBeCloseTo(0, 5);
  });

  it("only returns beats within the visible viewport when zoomed in", () => {
    // 120 BPM => 0.5s per beat. 10-second track. Zoom=2 => seeing first 5 seconds.
    const result = computeBeatGridPcts({
      beatGrid: baseGrid,
      maxDuration: 10,
      scrollPct: 0,
      zoom: 2,
    });
    // Visible: [0, 5s]. Beats at 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5 => 11 beats
    expect(result).toHaveLength(11);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[10]).toBeCloseTo(100, 5);
  });

  it("returns beats in the scrolled viewport", () => {
    // 120 BPM => 0.5s per beat. 10-second track. Zoom=2, scroll=50% => seeing [2.5, 7.5s].
    const result = computeBeatGridPcts({
      beatGrid: baseGrid,
      maxDuration: 10,
      scrollPct: 50,
      zoom: 2,
    });
    // Visible: [2.5, 7.5s]. Beats at 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5 => 11 beats
    expect(result).toHaveLength(11);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[10]).toBeCloseTo(100, 5);
  });

  it("returns fewer beats at higher zoom levels", () => {
    // 120 BPM => 0.5s per beat. 10-second track. Zoom=4 => seeing 2.5s.
    const result = computeBeatGridPcts({
      beatGrid: baseGrid,
      maxDuration: 10,
      scrollPct: 0,
      zoom: 4,
    });
    // Visible: [0, 2.5s]. Beats: 0, 0.5, 1, 1.5, 2, 2.5 => 6 beats
    expect(result).toHaveLength(6);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[5]).toBeCloseTo(100, 5);
  });

  it("produces evenly spaced beat positions", () => {
    // 60 BPM => 1s per beat. 8-second track.
    const result = computeBeatGridPcts({
      beatGrid: { bpm: 60, beat_offset_seconds: 0, confidence: 0.95 },
      maxDuration: 8,
      scrollPct: 0,
      zoom: 1,
    });
    // 9 beats: 0, 1, 2, 3, 4, 5, 6, 7, 8
    expect(result).toHaveLength(9);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo((i / 8) * 100, 5);
    }
  });
});

describe("decayPeak", () => {
  it("decreases peak by decay amount", () => {
    expect(decayPeak(100, 0.8)).toBeCloseTo(99.2, 5);
  });

  it("does not go below zero", () => {
    expect(decayPeak(0.5, 0.8)).toBe(0);
    expect(decayPeak(0, 0.8)).toBe(0);
  });

  it("handles zero decay", () => {
    expect(decayPeak(50, 0)).toBe(50);
  });

  it("handles large decay in one step", () => {
    expect(decayPeak(10, 20)).toBe(0);
  });
});
