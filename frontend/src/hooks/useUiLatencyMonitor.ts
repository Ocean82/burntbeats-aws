import { useState, useEffect, useCallback } from "react";

export type UiLatencyKey =
  | "help-modal-open"
  | "export-modal-open"
  | "presets-modal-open"
  | "mixer-ready-after-stems";

export interface UiLatencyStats {
  lastMs: number;
  avgMs: number;
  count: number;
  p50Ms: number;
  p95Ms: number;
  samples: number[];
}

export type UiLatencySnapshot = Partial<Record<UiLatencyKey, UiLatencyStats>>;

const MAX_LATENCY_SAMPLES = 50;

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function startUiLatencyMark(key: UiLatencyKey): void {
  if (typeof performance === "undefined") return;
  performance.mark(`${key}:start`);
}

export function finishUiLatencyMark(key: UiLatencyKey): void {
  if (typeof performance === "undefined") return;
  const start = `${key}:start`;
  const end = `${key}:end`;
  const measure = `${key}:measure`;
  performance.mark(end);
  try {
    performance.measure(measure, start, end);
    const entries = performance.getEntriesByName(measure);
    const durationMs = entries[entries.length - 1]?.duration;
    if (import.meta.env.DEV && typeof durationMs === "number") {
      window.dispatchEvent(
        new CustomEvent<UiLatencyEventDetail>("ui-latency-measure", {
          detail: { key, durationMs },
        })
      );
    }
  } catch {
    // No-op if mark pair is incomplete.
  } finally {
    performance.clearMarks(start);
    performance.clearMarks(end);
    performance.clearMeasures(measure);
  }
}

interface UiLatencyEventDetail {
  key: UiLatencyKey;
  durationMs: number;
}

/**
 * Tracks UI latency measurements from custom events.
 * Exposes start/finish functions and accumulated stats.
 */
export function useUiLatencyMonitor() {
  const [latencyStats, setLatencyStats] = useState<UiLatencySnapshot>({});

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (event: Event) => {
      const { detail } = event as CustomEvent<UiLatencyEventDetail>;
      if (!detail || typeof detail.durationMs !== "number") return;
      setLatencyStats((prev) => {
        const existing = prev[detail.key];
        const nextSamplesRaw = existing ? [...existing.samples, detail.durationMs] : [detail.durationMs];
        const nextSamples = nextSamplesRaw.length > MAX_LATENCY_SAMPLES
          ? nextSamplesRaw.slice(nextSamplesRaw.length - MAX_LATENCY_SAMPLES)
          : nextSamplesRaw;
        const nextCount = (existing?.count ?? 0) + 1;
        const nextAvg = existing
          ? ((existing.avgMs * existing.count) + detail.durationMs) / nextCount
          : detail.durationMs;
        return {
          ...prev,
          [detail.key]: {
            lastMs: detail.durationMs,
            avgMs: nextAvg,
            count: nextCount,
            p50Ms: percentile(nextSamples, 50),
            p95Ms: percentile(nextSamples, 95),
            samples: nextSamples,
          },
        };
      });
    };
    window.addEventListener("ui-latency-measure", handler as EventListener);
    return () => window.removeEventListener("ui-latency-measure", handler as EventListener);
  }, []);

  const resetLatencyStats = useCallback(() => setLatencyStats({}), []);

  return { latencyStats, startUiLatencyMark, finishUiLatencyMark, resetLatencyStats };
}
