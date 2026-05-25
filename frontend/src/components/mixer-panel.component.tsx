import { RotateCcw, Sliders, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { StemDefinition } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import type { BeatGridMetadata } from "../api";
import { DjModeEditor } from "./dj-mode";
import type { SeekPhase } from "../types/playbackSeek";

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
  /** Master output gain, 0–1.5 (default 1.0 = 0 dB). */
  masterVolume: number;
  /** Callback to update master output gain. */
  onMasterVolumeChange: (value: number) => void;
  masterLimiterEnabled: boolean;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  /** Optional beat-grid metadata from backend BPM analysis. */
  beatGrid?: BeatGridMetadata | null;
  /** Whether loop playback is enabled. */
  loopEnabled?: boolean;
  /** Callback to toggle loop playback. */
  onLoopToggle?: (enabled: boolean) => void;
}

export function MixerPanel({
  mixStemCount,
  splitStemCount: _splitStemCount = null,
  isPlayingMix,
  onPlayStop,
  onStopMix,
  onSeekMix,
  isExporting,
  onExport,
  onCompareExport: _onCompareExport,
  isComparingExport: _isComparingExport,
  onResetLevels,
  onResetSingleStem: _onResetSingleStem,
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
  getMasterAnalyserFrequencyData: _getMasterAnalyserFrequencyData,
  getStemAnalyserTimeDomainData,
  masterVolume,
  onMasterVolumeChange,
  masterLimiterEnabled,
  onMasterLimiterEnabledChange,
  beatGrid,
  loopEnabled = false,
  onLoopToggle,
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
    () => 0
  );

  if (mixStemCount === 0) {
    return (
      <>
        <p className="eyebrow">Stems</p>
        <h2 className="font-display mb-lg text-2xl tracking-[-0.04em] text-foreground">Timeline</h2>
        <div 
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/[0.02] py-12 text-center"
          role="region"
          aria-label="Empty timeline - no stems loaded"
        >
          <Sliders className="h-10 w-10 text-muted-foreground mb-md" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium mb-1">Timeline</p>
          <p className="text-muted-foreground text-xs text-pretty">
            Split a track or load stem files above to start mixing and exporting.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <div>
          <p className="eyebrow">Stems</p>
          <h2 className="font-display text-xl tracking-[-0.04em] text-foreground sm:text-2xl">
            Timeline
          </h2>
        </div>
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

      {/* Loading error with retry */}
      {loadingError && (
        <div className="mb-md rounded-xl border border-destructive-400/30 bg-destructive-950/30 px-md py-sm" role="alert">
          <div className="flex items-center justify-between gap-sm">
            <div>
              <p className="text-sm font-medium text-destructive-200">Failed to load stems</p>
              <p className="mt-0.5 text-xs text-destructive-300/90">{loadingError}</p>
            </div>
            {onRetryLoadStems && (
              <button
                type="button"
                onClick={onRetryLoadStems}
                className="tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg bg-primary px-sm py-xs text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                aria-label="Retry loading stems"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

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
        isExporting={isExporting}
        onExport={onExport}
      />
    </>
  );
}

