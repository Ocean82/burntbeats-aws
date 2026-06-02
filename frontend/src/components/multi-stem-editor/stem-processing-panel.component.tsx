/**
 * StemProcessingPanel — shared pitch/EQ/amplitude/time/FX controls for the active stem.
 * Used by MultiStemEditor and DjModeEditor waveform workspaces.
 */
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  Copy,
  Sliders,
  Sparkles,
  Timer,
  Waves,
  X,
} from "lucide-react";

import type { StemDefinition } from "../../types";
import { cn } from "../../utils/cn";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";
import {
  applyMixerToAllStems,
  type CopySettingsScope,
} from "../../utils/copyStemSettings";
import { isStemModified } from "../../utils/isStemModified";
import {
  PitchPanel,
  EQPanel,
  AmplitudePanel,
  TimePanel,
  FXPanel,
} from "./panels";

export type StemProcessingPanelId = "pitch" | "eq" | "amplitude" | "time" | "fx";

export interface StemProcessingToolbarProps {
  activePanel: StemProcessingPanelId | null;
  playbackReady: boolean;
  onPanelChange: (panel: StemProcessingPanelId | null) => void;
  className?: string;
}

export function StemProcessingToolbar({
  activePanel,
  playbackReady,
  onPanelChange,
  className,
}: StemProcessingToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2xs rounded-xl border border-border bg-muted p-0.5",
        className,
      )}
      role="toolbar"
      aria-label="Stem processing tools"
    >
      {(
        [
          { id: "pitch" as const, icon: Waves, label: "Pitch" },
          { id: "eq" as const, icon: Sliders, label: "EQ" },
          { id: "amplitude" as const, icon: Activity, label: "Amplitude" },
          { id: "time" as const, icon: Timer, label: "Time" },
          { id: "fx" as const, icon: Sparkles, label: "FX" },
        ] as const
      ).map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onPanelChange(activePanel === id ? null : id)}
          disabled={!playbackReady}
          aria-pressed={activePanel === id}
          className={cn(
            "flex items-center gap-xs rounded-lg px-sm py-1.5 text-xs font-medium transition",
            activePanel === id
              ? "bg-primary-500/20 text-primary-200"
              : "text-muted-foreground hover:text-foreground",
            !playbackReady && "cursor-not-allowed opacity-40",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export interface StemProcessingPanelProps {
  activePanel: StemProcessingPanelId;
  stems: StemDefinition[];
  activeStem: StemDefinition;
  activeState: StemEditorState;
  activeStemId: string;
  stemStates: Record<string, StemEditorState>;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
  onClose: () => void;
  className?: string;
}

export function StemProcessingPanel({
  activePanel,
  stems,
  activeStem,
  activeState,
  activeStemId,
  stemStates,
  onStemStateChange,
  onActiveStemChange,
  onClose,
  className,
}: StemProcessingPanelProps) {
  const [channelsSummaryOpen, setChannelsSummaryOpen] = useState(true);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

  const handleCopySettings = useCallback(
    (scope: CopySettingsScope) => {
      setCopyMenuOpen(false);
      const sourceId = activeStemId;
      if (!sourceId) return;
      const ids = stems.map((s) => s.id);
      const modifiedCount = ids.filter(
        (id) =>
          id !== sourceId &&
          isStemModified(stemStates[id] ?? defaultStemState()),
      ).length;
      if (
        modifiedCount > 0 &&
        !window.confirm(`Overwrite ${modifiedCount} modified channel(s)?`)
      ) {
        return;
      }
      const next = applyMixerToAllStems(sourceId, stemStates, ids, { scope });
      for (const id of ids) {
        if (id === sourceId && scope !== "all") continue;
        const patch = next[id];
        if (patch) onStemStateChange(id, patch);
      }
    },
    [activeStemId, stems, stemStates, onStemStateChange],
  );

  return (
    <div
      className={cn(
        "flex max-h-[320px] flex-col overflow-y-auto rounded-xl border border-border bg-chrome backdrop-blur-md shadow-[-8px_0_24px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-md py-sm bg-secondary">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary-300">
          {activePanel === "pitch" && "Pitch Shift"}
          {activePanel === "eq" && "EQ & Filters"}
          {activePanel === "amplitude" && "Amplitude"}
          {activePanel === "time" && "Time Stretch"}
          {activePanel === "fx" && "Effects"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="tap-target-expand rounded-md text-muted-foreground transition-[color,transform] duration-[var(--motion-fast)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setChannelsSummaryOpen((o) => !o)}
          className="tap-feedback flex min-h-[44px] w-full items-center justify-between px-md py-xs text-meta font-semibold uppercase tracking-wider text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={channelsSummaryOpen}
        >
          All channels
          <ChevronDown className={cn("h-3.5 w-3.5", channelsSummaryOpen && "rotate-180")} />
        </button>
        {channelsSummaryOpen && (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto px-xs pb-2">
            {stems.map((s) => {
              const st = stemStates[s.id] ?? defaultStemState();
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onActiveStemChange(s.id)}
                    className={cn(
                      "tap-feedback flex min-h-[44px] w-full gap-xs rounded-lg px-xs py-xs text-left text-helper transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
                      s.id === activeStemId && "bg-primary-500/10",
                    )}
                  >
                    <span className="truncate flex-1">{s.label}</span>
                    <span className="font-mono text-helper text-muted-foreground">
                      {st.mixer.gain.toFixed(0)}dB
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <motion.div layout className="flex flex-col gap-lg p-md">
        {activePanel === "pitch" && (
          <PitchPanel
            stemId={activeStem.id}
            stemLabel={activeStem.label}
            state={activeState}
            onChange={onStemStateChange}
          />
        )}
        {activePanel === "eq" && (
          <EQPanel
            stemId={activeStem.id}
            stemLabel={activeStem.label}
            state={activeState}
            onChange={onStemStateChange}
          />
        )}
        {activePanel === "amplitude" && (
          <AmplitudePanel
            stemId={activeStem.id}
            stemLabel={activeStem.label}
            state={activeState}
            onChange={onStemStateChange}
          />
        )}
        {activePanel === "time" && (
          <TimePanel
            stemId={activeStem.id}
            stemLabel={activeStem.label}
            state={activeState}
            onChange={onStemStateChange}
          />
        )}
        {activePanel === "fx" && (
          <FXPanel
            stemId={activeStem.id}
            stemLabel={activeStem.label}
            state={activeState}
            onChange={onStemStateChange}
          />
        )}
      </motion.div>

      <div className="relative border-t border-border p-sm">
        <button
          type="button"
          onClick={() => setCopyMenuOpen((o) => !o)}
          className="flex min-h-[40px] w-full items-center justify-center gap-xs rounded-lg border border-border bg-muted px-sm py-xs text-xs font-medium text-secondary-foreground hover:border-primary-400/30 hover:text-primary-100 transition"
          aria-expanded={copyMenuOpen}
          aria-haspopup="menu"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy settings
          <ChevronDown className={cn("h-3.5 w-3.5", copyMenuOpen && "rotate-180")} />
        </button>
        {copyMenuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border bg-chrome py-1 shadow-elevation-md"
          >
            {(
              [
                ["all", "Apply to all"],
                ["eq", "Copy EQ"],
                ["fx", "Copy FX"],
                ["pitchTime", "Copy pitch/time"],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                role="menuitem"
                onClick={() => handleCopySettings(scope)}
                className="block w-full px-sm py-xs text-left text-xs text-secondary-foreground hover:bg-muted hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


