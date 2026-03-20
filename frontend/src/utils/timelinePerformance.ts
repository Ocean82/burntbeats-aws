/**
 * Opt-in timeline performance checkpoints (seek, zoom/scroll, seek while mix playing).
 * Enable: dev server + `?timelinePerf=1`, or `localStorage.setItem("burntbeats:timeline-perf", "1")`.
 * Dump: `window.__BB_DUMP_TIMELINE_PERF?.()` in the browser console.
 */

export const TIMELINE_PERF_STORAGE_KEY = "burntbeats:timeline-perf";
export const TIMELINE_PERF_QUERY_VALUE = "1";

export type TimelinePerfCategory = "seek" | "seekDuringMix" | "zoom" | "scroll";

export interface TimelinePerfSummaryRow {
  readonly category: string;
  readonly count: number;
  readonly meanMs: number;
  readonly maxMs: number;
}

/** Single-call budgets for synchronous React scheduling + parent work (not full paint). */
export const TIMELINE_PERF_BUDGET_MS: Readonly<Record<TimelinePerfCategory, number>> = {
  seek: 12,
  seekDuringMix: 40,
  zoom: 24,
  scroll: 24,
};

const SAMPLE_CAP = 120;
const samples = new Map<string, number[]>();

export function timelinePerfShouldEnable(params: {
  readonly isDev: boolean;
  readonly storageFlag: string | null;
  readonly search: string;
}): boolean {
  if (params.storageFlag === TIMELINE_PERF_QUERY_VALUE) return true;
  if (!params.isDev) return false;
  try {
    const value = new URLSearchParams(params.search).get("timelinePerf");
    return value === TIMELINE_PERF_QUERY_VALUE;
  } catch {
    return false;
  }
}

export function isTimelinePerformanceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const storageFlag = window.localStorage.getItem(TIMELINE_PERF_STORAGE_KEY);
    const isDev = Boolean(import.meta.env.DEV);
    return timelinePerfShouldEnable({
      isDev,
      storageFlag,
      search: window.location.search ?? "",
    });
  } catch {
    return false;
  }
}

export function summarizeDurations(durations: readonly number[]): Pick<TimelinePerfSummaryRow, "count" | "meanMs" | "maxMs"> {
  if (durations.length === 0) {
    return { count: 0, meanMs: 0, maxMs: 0 };
  }
  let sum = 0;
  let maxMs = 0;
  for (const value of durations) {
    sum += value;
    if (value > maxMs) maxMs = value;
  }
  return {
    count: durations.length,
    meanMs: sum / durations.length,
    maxMs,
  };
}

export function getTimelinePerformanceSummary(): TimelinePerfSummaryRow[] {
  const rows: TimelinePerfSummaryRow[] = [];
  for (const [category, durations] of samples.entries()) {
    const { count, meanMs, maxMs } = summarizeDurations(durations);
    rows.push({ category, count, meanMs, maxMs });
  }
  return rows.sort((left, right) => left.category.localeCompare(right.category));
}

export function resetTimelinePerformanceSamples(): void {
  samples.clear();
}

function pushSample(category: string, durationMs: number): void {
  let bucket = samples.get(category);
  if (!bucket) {
    bucket = [];
    samples.set(category, bucket);
  }
  bucket.push(durationMs);
  while (bucket.length > SAMPLE_CAP) bucket.shift();
}

function budgetFor(category: TimelinePerfCategory): number {
  return TIMELINE_PERF_BUDGET_MS[category];
}

export function recordTimelinePerformanceSample(category: TimelinePerfCategory, durationMs: number): void {
  if (!isTimelinePerformanceEnabled()) return;
  pushSample(category, durationMs);
  const budget = budgetFor(category);
  if (durationMs > budget) {
    console.warn(
      `[burntbeats/timeline-perf] ${category} exceeded budget: ${durationMs.toFixed(2)}ms (budget ${budget}ms)`
    );
  }
}

export function installTimelinePerformanceDebugHooks(): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.__BB_DUMP_TIMELINE_PERF = () => {
    console.table(getTimelinePerformanceSummary());
  };
  window.__BB_RESET_TIMELINE_PERF = () => {
    resetTimelinePerformanceSamples();
    console.info("[burntbeats/timeline-perf] samples cleared");
  };
  return () => {
    window.__BB_DUMP_TIMELINE_PERF = undefined;
    window.__BB_RESET_TIMELINE_PERF = undefined;
  };
}
