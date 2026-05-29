import { RotateCcw, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { StemDefinition } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import type { BeatGridMetadata } from "../api";
import { DjModeEditor } from "./dj-mode";
import type { SeekPhase } from "../types/playbackSeek";
import type { MixerPreset } from "./MixerPresetsModal";
import { ForgeTimelineEmpty } from "./editor/ForgeTimelineEmpty";

export interface MixerPanelProps {
  mixStemCount: number;
  splitStemCount?: 2 | 4 | null;
  isPlayingMix: boolean;
  onPlayStop: () => void;
  onStopMix: () => void;
  onSeekMix?: (pct: number, opts?: { phase?: SeekPhase }) => void;
  isExporting: boolean;
  onExport: () => void;
  onCompareExport?: () => void;
  isComparingExport?: boolean;
  onResetLevels: () => void;
  onResetSingleStem?: (stemId: string) => void;
  hasStemBuffers: boolean;
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  getPlayheadPosition: () => number;
  subscribePlayheadPosition: (listener: () => void) => () => void;
  isLoadingStems: boolean;
  loadingError?: string | null;
  onRetryLoadStems?: () => void;
  activeStemId: string;
  onActiveStemChange: (stemId: string) => void;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
  loadingPreviewStemId: string | null;
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  getStemAnalyserTimeDomainData: (stemId: string) => Uint8Array | null;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  masterLimiterEnabled: boolean;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  beatGrid?: BeatGridMetadata | null;
  loopEnabled?: boolean;
  onLoopToggle?: (enabled: boolean) => void;
  isRecording?: boolean;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onLoadGenrePreset?: (preset: MixerPreset) => void;
}

export function MixerPanel({
  mixStemCount,
  splitStemCount = null,
  isPlayingMix,
  onPlayStop,
  onStopMix,
  onSeekMix,
  isExporting,
  onExport,
  onCompareExport,
  isComparingExport = false,
  onResetLevels,
  onResetSingleStem,
  hasStemBuffers,
  stems,
  waveforms,
  durations,
  stemStates,
  getPlayheadPosition,
  subscribePlayheadPosition,
  isLoadingStems,
  loadingError = null,
  onRetryLoadStems,
  activeStemId,
  onActiveStemChange,
  onStemStateChange,
  onPreviewStem,
  playingStemId,
  loadingPreviewStemId,
  getMasterAnalyserTimeDomainData,
  getMasterAnalyserTimeDomainDataLeft,
  getMasterAnalyserTimeDomainDataRight,
  getMasterAnalyserFrequencyData,
  getStemAnalyserTimeDomainData,
  masterVolume,
  onMasterVolumeChange,
  masterLimiterEnabled,
  onMasterLimiterEnabledChange,
  beatGrid,
  loopEnabled = false,
  onLoopToggle,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
  onLoadGenrePreset,
}: MixerPanelProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const preMuteVolumeRef = useRef(masterVolume);
  const handleMasterMuteToggle = useCallback(() => {
    if (masterMuted) {
      setMasterMuted(false);
      onMasterVolumeChange(preMuteVolumeRef.current);
    } else {
      preMuteVolumeRef.current = masterVolume;
      setMasterMuted(true);
      onMasterVolumeChange(0);
    }
  }, [masterMuted, masterVolume, onMasterVolumeChange]);

  const handleMasterReset = useCallback(() => {
    setMasterMuted(false);
    onMasterVolumeChange(1);
  }, [onMasterVolumeChange]);

  const playheadPct = useSyncExternalStore(
    subscribePlayheadPosition,
    getPlayheadPosition,
    () => 0,
  );

  if (mixStemCount === 0) {
    return <ForgeTimelineEmpty />;
  }

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center justify-end gap-sm">
        {splitStemCount != null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {splitStemCount}-stem mode
          </span>
        ) : null}
        {showResetConfirm ? (
          <div className="flex items-center gap-xs rounded-xl border border-primary-400/30 bg-primary-500/10 px-sm py-xs">
            <span className="text-xs text-primary-200">Reset all levels?</span>
            <button
              type="button"
              onClick={() => {
                onResetLevels();
                setShowResetConfirm(false);
              }}
              className="tap-feedback min-h-[44px] rounded bg-primary px-xs py-xs text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="tap-feedback min-h-[44px] rounded border border-border px-xs py-xs text-xs text-secondary-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ghost-button tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg border border-border px-sm py-xs text-xs text-muted-foreground transition-[color,transform] duration-[var(--motion-fast)] hover:text-foreground focus-visible:outline-none disabled:cursor-not-allowed"
            onClick={() => setShowResetConfirm(true)}
            disabled={!hasStemBuffers}
            aria-label="Reset all mixer levels to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset levels
          </button>
        )}
      </div>

      {loadingError ? (
        <div
          className="mb-md rounded-xl border border-destructive-400/30 bg-destructive-950/30 px-md py-sm"
          role="alert"
        >
          <div className="flex items-center justify-between gap-sm">
            <div>
              <p className="text-sm font-medium text-destructive-200">
                Failed to load stems
              </p>
              <p className="mt-0.5 text-xs text-destructive-300/90">{loadingError}</p>
            </div>
            {onRetryLoadStems ? (
              <button
                type="button"
                onClick={onRetryLoadStems}
                className="tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg bg-primary px-sm py-xs text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                aria-label="Retry loading stems"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <DjModeEditor
        stems={stems}
        waveforms={waveforms}
        durations={durations}
        stemStates={stemStates}
        isPlaying={isPlayingMix}
        playheadPct={playheadPct}
        isLoadingStems={isLoadingStems}
        playbackReady={hasStemBuffers}
        activeStemId={activeStemId}
        onActiveStemChange={onActiveStemChange}
        onStemStateChange={onStemStateChange}
        onSeek={(pct, opts) => {
          if (onSeekMix) {
            onSeekMix(pct, opts);
            return;
          }
          if (isPlayingMix) onStopMix();
        }}
        onPlayPause={onPlayStop}
        onPreviewStem={onPreviewStem}
        playingStemId={playingStemId}
        loadingPreviewStemId={loadingPreviewStemId}
        getAnalyserData={getMasterAnalyserTimeDomainData}
        getStemAnalyserTimeDomainData={getStemAnalyserTimeDomainData}
        beatGrid={beatGrid}
        loopEnabled={loopEnabled}
        onLoopToggle={onLoopToggle}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        masterVolume={masterVolume}
        masterMuted={masterMuted}
        masterLimiterEnabled={masterLimiterEnabled}
        onMasterVolumeChange={onMasterVolumeChange}
        onMasterMuteToggle={handleMasterMuteToggle}
        onMasterReset={handleMasterReset}
        onMasterLimiterEnabledChange={onMasterLimiterEnabledChange}
        getMasterAnalyserTimeDomainData={getMasterAnalyserTimeDomainData}
        getMasterAnalyserTimeDomainDataLeft={getMasterAnalyserTimeDomainDataLeft}
        getMasterAnalyserTimeDomainDataRight={getMasterAnalyserTimeDomainDataRight}
        getMasterAnalyserFrequencyData={getMasterAnalyserFrequencyData}
        onLoadGenrePreset={onLoadGenrePreset}
        isExporting={isExporting}
        onExport={onExport}
        onCompareExport={onCompareExport}
        isComparingExport={isComparingExport}
      />
      <span className="sr-only">
        {Boolean(onResetSingleStem)}
        {Boolean(getMasterAnalyserFrequencyData)}
      </span>
    </>
  );
}
