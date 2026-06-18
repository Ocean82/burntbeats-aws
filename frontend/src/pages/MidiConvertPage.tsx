/**
 * MidiConvertPage — dedicated page for Audio-to-MIDI conversion.
 */
import { motion } from "framer-motion";
import { History, Piano } from "lucide-react";
import { useState } from "react";
import { MidiConvertPanel } from "../components/midi-convert/MidiConvertPanel";
import { MidiResultPanel } from "../components/midi-convert/MidiResultPanel";
import { MIDI_EDITOR_E2E_FIXTURE } from "../components/midi-convert/midiEditorE2eFixture";
import { MidiExportDashboard } from "../components/library/MidiExportDashboard";
import { PanelHeader } from "../components/ui";
import { cn } from "../utils/cn";
import { viewSwitchMotion } from "../motion/presets";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface MidiConvertPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
}

type PageTab = "workstation" | "history";

export function MidiConvertPage({
  reduceMotion,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
  onViewPlans,
}: MidiConvertPageProps) {
  const [activeTab, setActiveTab] = useState<PageTab>("workstation");
  const showE2eMidiEditor =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("e2e-midi-editor") === "1";

  const tabs = (
    <div className="inline-flex rounded-md border border-border p-0.5" role="tablist">
      {([
        { id: "workstation" as const, label: "Workstation", icon: Piano },
        { id: "history" as const, label: "History", icon: History },
      ]).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          onClick={() => setActiveTab(id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-sm py-1 text-xs font-medium capitalize transition",
            activeTab === id
              ? "bg-accent-midi/20 text-accent-midi-200"
              : "text-muted-foreground hover:text-secondary-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <motion.section className="stack-md" {...viewSwitchMotion(reduceMotion)}>
      <div
        className="glass-panel ui-panel overflow-hidden rounded-2xl"
        data-testid="midi-convert-page"
      >
        <PanelHeader
          title={activeTab === "history" ? "MIDI Export" : "Audio to MIDI"}
          subtitle={
            activeTab === "history"
              ? "Browse and batch-export past conversions"
              : "Transcribe stems or uploads, refine in the editor, export to your DAW"
          }
          actions={tabs}
        />
        <div className="midi-workspace px-md pb-lg pt-sm sm:px-lg">
          {activeTab === "history" ? (
            <MidiExportDashboard />
          ) : showE2eMidiEditor ? (
            <MidiResultPanel
              result={MIDI_EDITOR_E2E_FIXTURE}
              onDownload={() => {}}
              onNewConversion={() => {}}
              initialMode="edit"
              e2eMode
            />
          ) : (
            <MidiConvertPanel
              usageBalance={usageBalance ?? null}
              usageLoading={usageLoading}
              subscriptionInactive={subscription.status === "inactive"}
              onViewPlans={onViewPlans}
              onOpenExportHistory={() => setActiveTab("history")}
            />
          )}
        </div>
        {subscription.billingError ? (
          <div
            className="mx-md mb-md rounded-xl border border-destructive-500/30 bg-destructive-950/20 px-md py-sm text-sm text-destructive-300 sm:mx-lg"
            role="alert"
          >
            {subscription.billingError}
          </div>
        ) : null}
        {checkoutNotice ? (
          <div className="mx-md mb-md rounded-xl border border-primary-500/30 bg-primary-500/10 px-md py-sm text-sm text-primary-100 sm:mx-lg">
            {checkoutNotice}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
