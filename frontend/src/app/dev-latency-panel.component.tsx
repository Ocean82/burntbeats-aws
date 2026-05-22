import { useState } from "react";
import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor";

interface DevLatencyPanelProps {
  latencyStats: UiLatencySnapshot;
  onResetLatencyStats: () => void;
}

export function DevLatencyPanel({
  latencyStats,
  onResetLatencyStats,
}: DevLatencyPanelProps) {
  const [visible, setVisible] = useState(true);

  if (import.meta.env.PROD) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="fixed bottom-4 left-4 z-[60] rounded-lg border border-border bg-chrome px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground backdrop-blur-md transition hover:text-foreground"
        aria-label={visible ? "Hide dev latency panel" : "Show dev latency panel"}
      >
        {visible ? "Hide latency" : "Show latency"}
      </button>
      {visible && (
        <div className="fixed bottom-14 left-4 z-50 w-72 rounded-xl border border-border bg-chrome p-sm text-[11px] text-secondary-foreground backdrop-blur-md">
          <div className="mb-xs flex items-center justify-between gap-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-300">
              UI latency (dev)
            </p>
            <button
              type="button"
              onClick={onResetLatencyStats}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary-foreground transition hover:text-foreground"
              aria-label="Reset latency stats"
            >
              Reset
            </button>
          </div>
          {(
            [
              ["help-modal-open", "Help modal"],
              ["export-modal-open", "Export modal"],
              ["presets-modal-open", "Presets modal"],
              ["mixer-ready-after-stems", "Mixer after split"],
            ] as const
          ).map(([key, label]) => {
            const stat = latencyStats[key];
            return (
              <div
                key={key}
                className="mb-1.5 flex items-center justify-between last:mb-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-secondary-foreground">
                  {stat
                    ? `${stat.lastMs.toFixed(0)} | ${stat.avgMs.toFixed(0)} | ${stat.p50Ms.toFixed(0)} | ${stat.p95Ms.toFixed(0)} (${stat.count})`
                    : "—"}
                </span>
              </div>
            );
          })}
          <p className="mt-xs text-[10px] text-muted-foreground">
            last | avg | p50 | p95 (count)
          </p>
        </div>
      )}
    </>
  );
}
