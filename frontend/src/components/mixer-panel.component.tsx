import { Download, Play, RotateCcw, Square, Sliders } from "lucide-react";
import { useSyncExternalStore } from "react";
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
  activeStemId,
  onActiveStemChange,
  onStemStateChange,
  onPreviewStem,
  playingStemId,
  loadingPreviewStemId,
  getMasterAnalyserTimeDomainData,
  getMasterAnalyserFrequencyData,
}: MixerPanelProps) {
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center">
          <Sliders className="h-10 w-10 text-white/25 mb-4" strokeWidth={1.5} />
          <p className="text-white/65 text-sm font-medium mb-1">Mixer</p>
          <p className="text-white/60 text-xs max-w-xs">Split a track or load stems to start mixing and exporting.</p>
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
              className="ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:text-white"
              onClick={onCompareExport}
              disabled={isComparingExport || !hasStemBuffers}
            >
              Compare server/client
            </button>
          )}
          <button
            type="button"
            className="ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:text-white"
            onClick={onResetLevels}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} />Reset levels
          </button>
        </div>
      </div>

      <MultiStemEditor
        stems={stems}
        waveforms={waveforms}
        durations={durations}
        stemStates={stemStates}
        isPlaying={isPlayingMix}
        playheadPct={playheadPct}
        isLoadingStems={isLoadingStems}
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

