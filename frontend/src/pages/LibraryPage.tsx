/**

 * LibraryPage — MIDI catalog and drum machine hub.

 */

import { BookOpen, Drum, Music2 } from "lucide-react";

import { useState } from "react";

import { ToolPageShell } from "../components/ToolPageShell";

import { PanelHeader, FilterBar } from "../components/ui";

import type { UseSubscriptionResult } from "../hooks/useSubscription";

import { MidiCatalogPanel } from "../components/library/MidiCatalogPanel";

import { DrumMachinePanel } from "../components/library/DrumMachinePanel";

import { cn } from "../utils/cn";



type LibraryTab = "catalog" | "drums";



export interface LibraryPageProps {

  reduceMotion: boolean;

  subscription: UseSubscriptionResult;

  checkoutNotice: string | null;

  onViewPlans?: () => void;

}



export function LibraryPage({

  reduceMotion,

  subscription,

  checkoutNotice,

  onViewPlans,

}: LibraryPageProps) {

  const [tab, setTab] = useState<LibraryTab>("catalog");



  return (

    <ToolPageShell

      borderColorClass="border-accent-midi-400/15"

      reduceMotion={reduceMotion}

      subscription={subscription}

      checkoutNotice={checkoutNotice}

      testId="library-page"

      onViewPlans={onViewPlans}

    >

      <div className="ui-panel overflow-hidden">

        <PanelHeader

          title="Library"

          subtitle={tab === "catalog" ? "Browse progressions and rhythm patterns" : "Build drum patterns"}

          actions={

            <span className="inline-flex items-center gap-xs text-xs text-muted-foreground">

              <BookOpen className="h-3.5 w-3.5" aria-hidden />

              Catalog & tools

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

                "inline-flex items-center gap-xs rounded px-sm py-1 text-xs font-medium transition",

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

                "inline-flex items-center gap-xs rounded px-sm py-1 text-xs font-medium transition",

                tab === "drums"

                  ? "bg-primary-500/20 text-primary-200"

                  : "text-muted-foreground hover:text-secondary-foreground",

              )}

            >

              <Drum className="h-3.5 w-3.5" />

              Drum machine

            </button>

          </div>

        </FilterBar>

        {tab === "catalog" ? <MidiCatalogPanel /> : <DrumMachinePanel embedded />}

      </div>

    </ToolPageShell>

  );

}

