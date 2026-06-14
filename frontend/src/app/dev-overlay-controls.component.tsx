import { useState, type ReactNode } from "react";
import type { AppView } from "../hooks/workflow/useEditorViewRouting";
import { isInternalHealthPanelEnabled } from "../config";
import { DevHealthPanel } from "./dev-health-panel.component";
import { DevLatencyPanel } from "./dev-latency-panel.component";
import { DevOverlayRestoreChip } from "./dev-overlay-restore-chip.component";
import { DevOverlayToggleBar } from "./dev-overlay-toggle-bar.component";
import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor";

interface DevOverlayControlsProps {
  latencyStats: UiLatencySnapshot;
  onResetLatencyStats: () => void;
  activeView: AppView;
}

function DevHealthToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-lg border border-border bg-chrome px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground backdrop-blur-md transition hover:text-foreground"
      aria-label={
        visible ? "Hide internal health panel" : "Show internal health panel"
      }
    >
      {visible ? "Hide health" : "Show health"}
    </button>
  );
}

function DevLatencyToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-dev-overlay="latency-toggle"
      className="rounded-lg border border-border bg-chrome px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground backdrop-blur-md transition hover:text-foreground"
      aria-label={visible ? "Hide dev latency panel" : "Show dev latency panel"}
    >
      {visible ? "Hide latency" : "Show latency"}
    </button>
  );
}

export function DevOverlayControls({
  latencyStats,
  onResetLatencyStats,
  activeView,
}: DevOverlayControlsProps) {
  const healthEnabled = isInternalHealthPanelEnabled();
  const [healthVisible, setHealthVisible] = useState(false);
  const [latencyVisible, setLatencyVisible] = useState(false);
  const useBeatsDrawer = activeView === "beats";

  const healthToggle: ReactNode = healthEnabled ? (
    <DevHealthToggle
      visible={healthVisible}
      onToggle={() => setHealthVisible((v) => !v)}
    />
  ) : null;

  const latencyToggle: ReactNode = (
    <DevLatencyToggle
      visible={latencyVisible}
      onToggle={() => setLatencyVisible((v) => !v)}
    />
  );

  return (
    <>
      {!useBeatsDrawer ? (
        <DevOverlayToggleBar
          healthToggle={healthToggle}
          latencyToggle={latencyToggle}
        />
      ) : null}
      {!useBeatsDrawer && healthEnabled && (
        <DevHealthPanel
          visible={healthVisible}
          onVisibleChange={setHealthVisible}
          showToggle={false}
        />
      )}
      {!useBeatsDrawer ? (
        <DevLatencyPanel
          latencyStats={latencyStats}
          onResetLatencyStats={onResetLatencyStats}
          visible={latencyVisible}
          onVisibleChange={setLatencyVisible}
          showToggle={false}
        />
      ) : null}
      <DevOverlayRestoreChip />
    </>
  );
}
