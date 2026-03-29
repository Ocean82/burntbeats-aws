import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TIMELINE_PERF_QUERY_VALUE,
  TIMELINE_PERF_STORAGE_KEY,
  getTimelinePerformanceSummary,
  recordTimelinePerformanceSample,
  resetTimelinePerformanceSamples,
  summarizeDurations,
  timelinePerfShouldEnable,
} from "./timelinePerformance";

describe("timelinePerfShouldEnable", () => {
  it("enables when storage flag is set regardless of dev", () => {
    expect(
      timelinePerfShouldEnable({
        isDev: false,
        storageFlag: TIMELINE_PERF_QUERY_VALUE,
        search: "",
      })
    ).toBe(true);
  });

  it("enables in dev when query param is 1", () => {
    expect(
      timelinePerfShouldEnable({
        isDev: true,
        storageFlag: null,
        search: "?timelinePerf=1",
      })
    ).toBe(true);
  });

  it("does not enable in prod without storage", () => {
    expect(
      timelinePerfShouldEnable({
        isDev: false,
        storageFlag: null,
        search: "?timelinePerf=1",
      })
    ).toBe(false);
  });
});

describe("summarizeDurations", () => {
  it("returns zeros for empty input", () => {
    expect(summarizeDurations([])).toEqual({ count: 0, meanMs: 0, maxMs: 0 });
  });

  it("computes mean and max", () => {
    expect(summarizeDurations([1, 2, 3])).toEqual({ count: 3, meanMs: 2, maxMs: 3 });
  });
});

describe("recordTimelinePerformanceSample", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetTimelinePerformanceSamples();
  });

  it("records samples when storage enables perf mode", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => (key === TIMELINE_PERF_STORAGE_KEY ? TIMELINE_PERF_QUERY_VALUE : null),
      },
      location: { search: "" },
    });

    recordTimelinePerformanceSample("zoom", 1.5);
    recordTimelinePerformanceSample("zoom", 2.5);

    const summary = getTimelinePerformanceSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0]?.category).toBe("zoom");
    expect(summary[0]?.count).toBe(2);
    expect(summary[0]?.meanMs).toBe(2);
    expect(summary[0]?.maxMs).toBe(2.5);
  });
});
