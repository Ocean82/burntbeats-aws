/**
 * DjMixerConsole — Bottom mixer panel with hardware-inspired vertical channel strips.
 * Renders only the tools the user has configured as visible.
 */
import { memo } from "react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
import type { DjToolSlot } from "../../hooks/useDjToolbarConfig";
import { DjChannelStrip } from "./dj-channel-strip.component";

export interface DjMixerConsoleProps {
  stems: StemDefinition[];
  stemStates: Record<string, StemEditorState>;
  activeStemId: string;
  playbackReady: boolean;
  isPlaying: boolean;
  playingStemId: string | null;
  visibleTools: DjToolSlot[];
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
}

export const DjMixerConsole = memo(function DjMixerConsole({
  stems,
  stemStates,
  activeStemId,
  playbackReady,
  isPlaying,
  playingStemId,
  visibleTools,
  getStemAnalyserTimeDomainData,
  onStemStateChange,
  onActiveStemChange,
}: DjMixerConsoleProps) {
  if (stems.length === 0) return null;

  const showFaders = visibleTools.some((t) => t.id === "faders");
  const showEq = visibleTools.some((t) => t.id === "eq");
  const showPan = visibleTools.some((t) => t.id === "pan");
  const showMeters = visibleTools.some((t) => t.id === "meters");

  return (
    <div
      className="dj-mixer-console flex items-stretch gap-2 overflow-x-auto overflow-y-visible px-4 py-3 pb-4"
      role="region"
      aria-label="DJ mixer console"
    >
      {stems.map((stem) => {
        const state = stemStates[stem.id] ?? defaultStemState();
        const isActive = stem.id === activeStemId;
        const isMeterPlaying =
          playbackReady && (isPlaying || playingStemId === stem.id);

        return (
          <DjChannelStrip
            key={stem.id}
            stem={stem}
            state={state}
            isActive={isActive}
            playbackReady={playbackReady}
            showFaders={showFaders}
            showEq={showEq}
            showPan={showPan}
            showMeters={showMeters}
            isMeterPlaying={isMeterPlaying}
            getStemAnalyserData={getStemAnalyserTimeDomainData}
            onStemStateChange={onStemStateChange}
            onActiveStemChange={onActiveStemChange}
          />
        );
      })}
    </div>
  );
});
