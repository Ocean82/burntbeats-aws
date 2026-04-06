import { Download, HelpCircle, Play, RotateCcw, Square, Sliders, RefreshCw, AlertTriangle } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { StemDefinition } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import { MultiStemEditor } from "./MultiStemEditor";
import { SpectrumAnalyzer } from "./SpectrumAnalyzer";
import { VUMeter } from "./VUMeter";
import { cn } from "../utils/cn";
import type { SeekPhase } from "../types/playbackSeek";

export interface MixerPanelProps {
  mixStemCount: number;
  isPlayingMix: boolean;
  onPlayStop: () => void;
  onStopMix: () => void;
  onSeekMix?: (pct: number, opts?: { phase?: SeekPhase }) => void;
  isExporting: boolean;
  onExport: () => void;
  onCompareExport?: () => void;
  isComparingExport?: boolean;
  onResetLevels: () => void;
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
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
}

export function MixerPanel({
  mixStemCount,
  isPlayingMix,
  onPlayStop,
  onStopMix,
  onSeekMix,
  isExporting,
  onExport,
  onCompareExport,
  isComparingExport,
  onResetLevels,
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
  getMasterAnalyserFrequencyData,
}: MixerPanelProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const playheadPct = useSyncExternalStore(
    subscribePlayheadPosition,
    getPlayheadPosition,
    () => 0
  );

  if (mixStemCount === 0) {
    return (
      <>
        <p className="eyebrow">Mixer</p>
        <h2 className="font-display text-2xl tracking-[-0.04em] text-white mb-5">Timeline · Mix · Export</h2>
        <div 
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center"
          role="region"
          aria-label="Empty mixer - no stems loaded"
        >
          <Sliders className="h-10 w-10 text-white/25 mb-4" strokeWidth={1.5} />
          <p className="text-white/65 text-sm font-medium mb-1">Mixer</p>
          <p className="text-white/60 text-xs max-w-xs">
            Split a track or load stem files above to start mixing and exporting.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">Mixer</p>
      <h2 className="font-display text-2xl tracking-[-0.04em] text-white mb-5">Timeline · Mix · Export</h2>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">Master output</p>
        <div className="flex flex-wrap items-end gap-4">
          <VUMeter
            getAnalyserData={getMasterAnalyserTimeDomainData}
            color="var(--accent)"
            isPlaying={isPlayingMix || playingStemId !== null}
            height={72}
          />
          <div className="min-h-[48px] min-w-[min(100%,12rem)] flex-1">
            <SpectrumAnalyzer
              getFrequencyData={getMasterAnalyserFrequencyData}
              isPlaying={isPlayingMix || playingStemId !== null}
              height={48}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/70">Trim, level, pan. Play mix, then export.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cn(
              "icon-pulse-hover flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition",
              isPlayingMix ? "border-amber-400/50 bg-amber-500/20 text-amber-100" : "ghost-button"
            )}
            onClick={onPlayStop}
            disabled={!hasStemBuffers}
          >
            {isPlayingMix ? <Square className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
            {isPlayingMix ? "Stop mix" : "Play mix"}
          </button>
          <button
            type="button"
            className="fire-button icon-pulse-hover flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            onClick={onExport}
            disabled={isExporting || !hasStemBuffers}
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {isExporting ? "Rendering..." : "Export"}
          </button>
          {onCompareExport && (
            <button
              type="button"
              className="group relative ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:text-white"
              onClick={onCompareExport}
              disabled={isComparingExport || !hasStemBuffers}
              title="Exports master twice (client & server) to compare accuracy"
            >
              {isComparingExport ? "Comparing..." : "Export diagnostics"}
              <HelpCircle className="h-3.5 w-3.5 text-white/40 group-hover:text-white/60" strokeWidth={1.5} />
            </button>
          )}
          {showResetConfirm ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-amber-200">Reset all levels?</span>
              <button
                type="button"
                onClick={() => { onResetLevels(); setShowResetConfirm(false); }}
                className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-black transition hover:bg-amber-400"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded border border-white/20 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-950/30 px-4 py-3" role="alert">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-red-200">Failed to load stems</p>
              <p className="mt-0.5 text-xs text-red-300/90">{loadingError}</p>
            </div>
            {onRetryLoadStems && (
              <button
                type="button"
                onClick={onRetryLoadStems}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-400"
                aria-label="Retry loading stems"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <MultiStemEditor
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
      />
    </>
  );
}

