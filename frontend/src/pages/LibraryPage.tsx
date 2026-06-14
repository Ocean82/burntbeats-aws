/**
 * LibraryPage — Beats hub: MIDI catalog and drum machine.
 */
import { Drum, Music2 } from "lucide-react";
import { useState } from "react";
import { ToolPageShell } from "../components/ToolPageShell";
import { PanelHeader, FilterBar } from "../components/ui";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor";
import { MidiCatalogPanel } from "../components/library/MidiCatalogPanel";
import { DrumMachineWorkspace } from "../components/library/DrumMachineWorkspace";
import { LibraryDevDrawer } from "../components/library/LibraryDevDrawer";
import { cn } from "../utils/cn";

type LibraryTab = "catalog" | "drums";

export interface LibraryDevToolsProps {
  latencyStats: UiLatencySnapshot;
  onResetLatencyStats: () => void;
}

export interface LibraryPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
  devTools?: LibraryDevToolsProps;
}

export function LibraryPage({
  reduceMotion,
  subscription,
  checkoutNotice,
  onViewPlans,
  devTools,
}: LibraryPageProps) {
  const [tab, setTab] = useState<LibraryTab>("catalog");

  return (
    <ToolPageShell
      borderColorClass="border-accent-midi-400/15"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="beats-page"
      onViewPlans={onViewPlans}
    >
      <div className="ui-panel overflow-hidden">
        <PanelHeader
          title="Beats"
          subtitle={tab === "catalog" ? "Browse progressions and rhythm patterns" : "Build drum patterns in the sequencer"}
          actions={
            <span className="inline-flex items-center gap-xs text-xs text-muted-foreground">
              <Drum className="h-3.5 w-3.5" aria-hidden />
              Catalog & drum machine
            </span>
          }
        />
        <FilterBar>
          <div className="inline-flex rounded-md border border-border p-0.5" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "catalog"}
              onClick={() => setTab("catalog")}
              className={cn(
                "inline-flex items-center gap-xs rounded px-sm py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === "catalog"
                  ? "bg-accent-midi/20 text-accent-midi-200"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              <Music2 className="h-3.5 w-3.5" />
              Catalog
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "drums"}
              onClick={() => setTab("drums")}
              className={cn(
                "inline-flex items-center gap-xs rounded px-sm py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === "drums"
                  ? "bg-accent-midi/20 text-accent-midi-200"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              <Drum className="h-3.5 w-3.5" />
              Drum machine
            </button>
          </div>
        </FilterBar>
        {tab === "catalog" ? (
          <MidiCatalogPanel />
        ) : (
          <DrumMachineWorkspace subscription={subscription} onViewPlans={onViewPlans} />
        )}
        {devTools ? (
          <LibraryDevDrawer
            latencyStats={devTools.latencyStats}
            onResetLatencyStats={devTools.onResetLatencyStats}
          />
        ) : null}
      </div>
    </ToolPageShell>
  );
}
