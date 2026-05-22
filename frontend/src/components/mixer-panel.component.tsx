import { Download, HelpCircle, Play, RotateCcw, Square, Sliders, RefreshCw, AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import type { StemDefinition } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import type { BeatGridMetadata } from "../api";
import { MultiStemEditor } from "./MultiStemEditor";
import { DjModeEditor } from "./dj-mode";
import { SpectrumAnalyzer } from "./SpectrumAnalyzer";
import { StereoVUMeter } from "./StereoVUMeter";
import { MixerVerticalFader } from "./multi-stem-editor/mixer-vertical-fader.component";
import { formatMasterGain } from "./dj-mode/dj-master-strip.component";
import { cn } from "../utils/cn";
import { useLayoutMode } from "../contexts/LayoutModeContext";
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
  splitStemCount = null,
  isPlayingMix,
  onPlayStop,
  onStopMix,
  onSeekMix,
  isExporting,
  onExport,
  onCompareExport,
  isComparingExport,
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
}: MixerPanelProps) {
  const { mode } = useLayoutMode();
  const reduceMotion = useReducedMotion();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const preMuteVolumeRef = useRef(masterVolume);
  const isMeterPlaying = isPlayingMix || playingStemId !== null;

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
        <p className="eyebrow">Mixer</p>
        <h2 className="font-display text-2xl tracking-[-0.04em] text-foreground mb-5">Timeline · Mix · Export</h2>
        <div 
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/[0.02] py-12 text-center"
          role="region"
          aria-label="Empty mixer - no stems loaded"
        >
          <Sliders className="h-10 w-10 text-muted-foreground mb-md" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium mb-1">Mixer</p>
          <p className="text-muted-foreground text-xs max-w-xs">
            Split a track or load stem files above to start mixing and exporting.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Mixer</p>
      <h2 className="font-display text-2xl tracking-[-0.04em] text-foreground mb-5">Timeline · Mix · Export</h2>

      {/* ── Master / spectrum band (DJ: spectrum only; classic: full master strip) ── */}
      {mode === "dj" ? (
        <div className="mb-5 flex overflow-hidden rounded-xl border border-border bg-muted px-sm py-sm">
          <div className="flex min-w-0 flex-1 flex-col gap-2xs">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Spectrum
            </p>
            <SpectrumAnalyzer
              getFrequencyData={getMasterAnalyserFrequencyData}
              isPlaying={isMeterPlaying}
              height={56}
            />
          </div>
        </div>
      ) : (
      <div className="mb-5 flex items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-muted">
        <div className="hidden min-w-0 flex-1 flex-col gap-2xs border-r border-border/[0.08] px-sm py-sm sm:flex">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Spectrum
          </p>
          <div className="flex-1">
            <SpectrumAnalyzer
              getFrequencyData={getMasterAnalyserFrequencyData}
              isPlaying={isMeterPlaying}
              height={56}
            />
          </div>
        </div>

        {/* Stereo VU meters with peak hold/decay */}
        <div className="flex flex-col items-center gap-2xs border-r border-border/[0.08] px-sm py-sm">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Level
          </p>
          <StereoVUMeter
            getAnalyserData={getMasterAnalyserTimeDomainData}
            getAnalyserDataLeft={getMasterAnalyserTimeDomainDataLeft}
            getAnalyserDataRight={getMasterAnalyserTimeDomainDataRight}
            isPlaying={isMeterPlaying}
            height={120}
            width={64}
          />
        </div>

        {/* Master fader column */}
        <div className="flex flex-col items-center gap-2xs px-md py-sm">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Master
          </p>
          <div className="relative flex flex-1 flex-col items-center justify-center gap-xs">
            <MixerVerticalFader
              value={masterMuted ? 0 : masterVolume}
              min={0}
              max={1.5}
              step={0.01}
              height={120}
              accentColor="#f59e0b"
              ariaLabel="Master output volume"
              muted={masterMuted}
              formatValue={formatMasterGain}
              resetValue={1}
              onChange={(v) => {
                if (masterMuted && v > 0) setMasterMuted(false);
                onMasterVolumeChange(v);
              }}
              onReset={handleMasterReset}
            />
            {/* dB readout / mute indicator */}
            <span
              className={cn(
                "font-mono text-[9px] font-semibold tabular-nums",
                masterMuted
                  ? "text-destructive-400"
                  : masterVolume > 1.05
                    ? "text-primary-300"
                    : masterVolume < 0.05
                      ? "text-muted-foreground"
                      : "text-muted-foreground",
              )}
              aria-hidden
            >
              {masterMuted ? "MUTE" : formatMasterGain(masterVolume)}
            </span>
            {/* Mute toggle */}
            <button
              type="button"
              onClick={handleMasterReset}
              className="rounded border border-border px-xs py-0.5 text-[9px] text-muted-foreground hover:text-foreground transition"
              aria-label="Reset master volume to 0 dB"
            >
              0 dB
            </button>
            <button
              type="button"
              onClick={handleMasterMuteToggle}
              aria-label={masterMuted ? "Unmute master" : "Mute master"}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition",
                masterMuted
                  ? "bg-destructive-500/20 text-destructive-400 hover:bg-destructive-500/30"
                  : "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground",
              )}
            >
              {masterMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </button>
            <button
              type="button"
              aria-label="Master limiter"
              onClick={() => onMasterLimiterEnabledChange(!masterLimiterEnabled)}
              className={cn(
                "rounded border px-xs py-0.5 text-[9px] uppercase tracking-wide transition",
                masterLimiterEnabled
                  ? "border-primary-400/50 bg-primary-500/20 text-primary-200"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              Lim
            </button>
          </div>
        </div>
      </div>
      )}

      <div className="mb-md flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-secondary-foreground">Trim, level, pan. Play mix, then export.</p>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          <button
            type="button"
            className={cn(
              "icon-pulse-hover flex items-center gap-xs rounded-xl border px-md py-sm text-sm font-medium transition",
              isPlayingMix ? "border-primary-400/50 bg-primary-500/20 text-primary-100" : "ghost-button"
            )}
            onClick={onPlayStop}
            disabled={!hasStemBuffers}
          >
            {isPlayingMix ? <Square className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
            {isPlayingMix ? "Stop mix" : "Play mix"}
          </button>
          <button
            type="button"
            className="fire-button icon-pulse-hover flex items-center gap-xs rounded-xl px-md py-sm text-sm"
            onClick={onExport}
            disabled={isExporting || !hasStemBuffers}
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {isExporting ? "Rendering..." : "Export"}
          </button>
          {onCompareExport && (
            <button
              type="button"
              className="group relative ghost-button flex items-center gap-xs rounded-xl border border-border px-md py-sm text-sm text-secondary-foreground transition hover:text-foreground"
              onClick={onCompareExport}
              disabled={isComparingExport || !hasStemBuffers}
              title="Exports master twice (client & server) to compare accuracy"
            >
              {isComparingExport ? "Comparing..." : "Export diagnostics"}
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-muted-foreground" strokeWidth={1.5} />
            </button>
          )}
          {showResetConfirm ? (
            <div className="flex items-center gap-xs rounded-xl border border-primary-400/30 bg-primary-500/10 px-sm py-xs">
              <AlertTriangle className="h-4 w-4 text-primary-400" />
              <span className="text-xs text-primary-200">Reset all levels?</span>
              <button
                type="button"
                onClick={() => { onResetLevels(); setShowResetConfirm(false); }}
                className="rounded bg-primary-500 px-xs py-1 text-xs font-medium text-black transition hover:bg-primary-400"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded border border-border px-xs py-1 text-xs text-secondary-foreground transition hover:bg-muted"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost-button flex items-center gap-xs rounded-xl border border-border px-md py-sm text-sm text-secondary-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setShowResetConfirm(true)}
              disabled={!hasStemBuffers}
              title={
                !hasStemBuffers
                  ? "Load stem audio first — then you can reset levels."
                  : undefined
              }
              aria-label="Reset all mixer levels to defaults"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />Reset levels
            </button>
          )}
        </div>
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
                className="flex items-center gap-xs rounded-lg bg-primary-500 px-sm py-1.5 text-xs font-medium text-black transition hover:bg-primary-400"
                aria-label="Retry loading stems"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
      {mode === "dj" ? (
        <motion.div
          key="dj"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
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
        />
        </motion.div>
      ) : (
        <motion.div
          key="classic"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
        <MultiStemEditor
          stems={stems}
          splitStemCount={splitStemCount}
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
          onResetSingleStem={onResetSingleStem}
        />
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}

