import { useState } from "react";

import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor";

import { useDevOverlayDismissed } from "./dev-overlay-dismiss";

const LATENCY_ROWS = [
  ["help-modal-open", "Help modal"],
  ["export-modal-open", "Export modal"],
  ["presets-modal-open", "Presets modal"],
  ["mixer-ready-after-stems", "Mixer after split"],
] as const;

interface DevLatencyPanelProps {
  latencyStats: UiLatencySnapshot;
  onResetLatencyStats: () => void;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  showToggle?: boolean;
  embedded?: boolean;
}

export function DevLatencyPanel({
  latencyStats,
  onResetLatencyStats,
  visible: visibleProp,
  onVisibleChange,
  showToggle = true,
  embedded = false,
}: DevLatencyPanelProps) {
  const [internalVisible, setInternalVisible] = useState(false);
  const { dismissed, dismiss } = useDevOverlayDismissed();

  const visible = visibleProp ?? internalVisible;
  const setVisible = onVisibleChange ?? setInternalVisible;

  if (import.meta.env.PROD || (!embedded && dismissed)) return null;

  const statsBody = (
    <>
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
      {LATENCY_ROWS.map(([key, label]) => {
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
    </>
  );

  if (embedded) {
    return <div data-testid="dev-latency-embedded">{statsBody}</div>;
  }

  const toggleButton = (
    <button
      type="button"
      onClick={() => setVisible(!visible)}
      data-dev-overlay="latency-toggle"
      className="rounded-lg border border-border bg-chrome px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground backdrop-blur-md transition hover:text-foreground"
      aria-label={visible ? "Hide dev latency panel" : "Show dev latency panel"}
    >
      {visible ? "Hide latency" : "Show latency"}
    </button>
  );

  return (
    <>
      {showToggle && (
        <div
          data-dev-overlay="latency-toggle-legacy"
          className="fixed right-4 top-4 z-[60] flex items-center gap-1"
        >
          {toggleButton}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-border bg-chrome px-1.5 py-1 text-[10px] text-muted-foreground backdrop-blur-md transition hover:text-foreground"
            aria-label="Dismiss dev overlay panels for this session"
            title="Hide dev tools until you click Restore"
          >
            ×
          </button>
        </div>
      )}
      {visible && (
        <div className="fixed right-4 top-12 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-chrome p-sm text-[11px] text-secondary-foreground backdrop-blur-md pointer-events-none">
          {statsBody}
        </div>
      )}
    </>
  );
}
