/**
 * LibraryPage — Beats hub: MIDI catalog and drum machine.
 */
import { useState, useEffect, useRef } from "react";
import { Drum, Music2 } from "lucide-react";
import { useSearch } from "wouter";
import { ToolPageShell } from "../components/ToolPageShell";
import { PanelHeader, FilterBar } from "../components/ui";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor";
import { MidiCatalogPanel } from "../components/library/MidiCatalogPanel";
import { DrumMachineWorkspace } from "../components/library/DrumMachineWorkspace";
import { LibraryDevDrawer } from "../components/library/LibraryDevDrawer";
import { getTool } from "../data/toolCatalog";
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
  onBackToHub?: () => void;
  /** Which tab to show initially (default: "catalog"). */
  initialTab?: LibraryTab;
  devTools?: LibraryDevToolsProps;
}

export function LibraryPage({
  reduceMotion,
  subscription,
  checkoutNotice,
  onViewPlans,
  onBackToHub,
  initialTab = "catalog",
  devTools,
}: LibraryPageProps) {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const focusParam = new URLSearchParams(search).get("focus");
  const resolvedInitialTab: LibraryTab =
    tabParam === "drums" || tabParam === "patterns"
      ? "drums"
      : tabParam === "catalog"
        ? tabParam
        : initialTab;
  const [tab, setTab] = useState<LibraryTab>(resolvedInitialTab);
  const patternsRef = useRef<HTMLDivElement>(null);
  const beatsTool = getTool("beats");

  useEffect(() => {
    if (focusParam !== "patterns" || tab !== "drums") return;
    const id = requestAnimationFrame(() => {
      patternsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [focusParam, tab]);

  return (
    <ToolPageShell
      borderColorClass="border-accent-midi-400/15"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="beats-page"
      onViewPlans={onViewPlans}
      onBackToHub={onBackToHub}
    >
      <div className="ui-panel overflow-hidden">
        <PanelHeader
          title={beatsTool.primaryName}
          subtitle={
            tab === "catalog"
              ? "Browse progressions and rhythm patterns"
              : "Build drum patterns in the sequencer"
          }
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
          <div ref={patternsRef}>
            <DrumMachineWorkspace
            subscription={subscription}
            onViewPlans={onViewPlans}
            reduceMotion={reduceMotion}
          />
          </div>
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
