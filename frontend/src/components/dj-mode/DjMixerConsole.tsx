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
import { DjMasterStrip } from "./dj-master-strip.component";
import { SectionLabel } from "../ui/SectionLabel";

export interface DjMixerConsoleProps {
  stems: StemDefinition[];
  stemStates: Record<string, StemEditorState>;
  activeStemId: string;
  playbackReady: boolean;
  isPlaying: boolean;
  playingStemId: string | null;
  loadingPreviewStemId?: string | null;
  visibleTools: DjToolSlot[];
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
  onPreviewStem?: (stemId: string) => void;
  onResetSingleStem?: (stemId: string) => void;
  masterVolume: number;
  masterMuted: boolean;
  masterLimiterEnabled: boolean;
  onMasterVolumeChange: (value: number) => void;
  onMasterMuteToggle: () => void;
  onMasterReset: () => void;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
}

export const DjMixerConsole = memo(function DjMixerConsole({
  stems,
  stemStates,
  activeStemId,
  playbackReady,
  isPlaying,
  playingStemId,
  loadingPreviewStemId = null,
  visibleTools,
  getStemAnalyserTimeDomainData,
  onStemStateChange,
  onActiveStemChange,
  onPreviewStem,
  onResetSingleStem,
  masterVolume,
  masterMuted,
  masterLimiterEnabled,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onMasterReset,
  onMasterLimiterEnabledChange,
  getMasterAnalyserTimeDomainData,
  getMasterAnalyserTimeDomainDataLeft,
  getMasterAnalyserTimeDomainDataRight,
}: DjMixerConsoleProps) {
  if (stems.length === 0) return null;

  const showFaders = visibleTools.some((t) => t.id === "faders");
  const showEq = visibleTools.some((t) => t.id === "eq");
  const showPan = visibleTools.some((t) => t.id === "pan");
  const showFx = visibleTools.some((t) => t.id === "fx");
  const showMeters = visibleTools.some((t) => t.id === "meters");
  const showMaster = visibleTools.some((t) => t.id === "master");
  const isMasterMeterPlaying =
    playbackReady && (isPlaying || playingStemId !== null);

  return (
    <div
      className="dj-mixer-console flex flex-col gap-xs overflow-visible px-md py-sm pb-md"
      role="region"
      aria-label="DJ mixer console"
    >
      <SectionLabel>Channels</SectionLabel>
      <div className="flex items-stretch gap-xs overflow-x-auto overflow-y-visible">
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
            showFx={showFx}
            showMeters={showMeters}
            isMeterPlaying={isMeterPlaying}
            isPreviewPlaying={playingStemId === stem.id}
            isLoadingPreview={loadingPreviewStemId === stem.id}
            getStemAnalyserData={getStemAnalyserTimeDomainData}
            onStemStateChange={onStemStateChange}
            onActiveStemChange={onActiveStemChange}
            onPreviewStem={onPreviewStem}
            onResetSingleStem={onResetSingleStem}
          />
        );
      })}
      </div>
      {showMaster && (
        <div className="flex items-stretch gap-xs overflow-x-auto border-t border-border/40 pt-sm">
          <SectionLabel>Master</SectionLabel>
          <div className="mx-1 w-px self-stretch bg-muted" role="separator" aria-orientation="vertical" />
          <DjMasterStrip
          masterVolume={masterVolume}
          masterMuted={masterMuted}
          masterLimiterEnabled={masterLimiterEnabled}
          playbackReady={playbackReady}
          isMeterPlaying={isMasterMeterPlaying}
          onMasterVolumeChange={onMasterVolumeChange}
          onMasterMuteToggle={onMasterMuteToggle}
          onMasterReset={onMasterReset}
          onMasterLimiterEnabledChange={onMasterLimiterEnabledChange}
          getMasterAnalyserData={getMasterAnalyserTimeDomainData}
          getMasterAnalyserDataLeft={getMasterAnalyserTimeDomainDataLeft}
          getMasterAnalyserDataRight={getMasterAnalyserTimeDomainDataRight}
        />
        </div>
      )}
    </div>
  );
});
