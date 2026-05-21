import { memo, useMemo } from "react";
import type { StemDefinition, TrimState } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
import type { BeatGridMetadata } from "../../api";
import { shouldRenderBeatGrid } from "../../utils/beatGrid";
import { WaveformLane } from "./waveform-lane.component";
import { playheadPercentStyle } from "../../utils/playheadCssVar";
import { generateFakeWaveform } from "../../utils/waveformCanvas";
import type { SeekPhase } from "../../types/playbackSeek";

const WAVEFORM_BINS = 512;

export interface WaveformTimelineProps {
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  /** Decoded buffer duration per stem (seconds); 0 until audio for that stem is ready. */
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isLoadingStems: boolean;
  zoom: number;
  scrollPct: number;
  activeStemId: string;
  playheadVisiblePct: number;
  showPlayhead: boolean;
  /** Ruler tick positions (0–100) used to draw time grid lines behind the lanes. */
  tickPcts?: number[];
  /** Beat-grid positions (0–100) computed from backend BPM metadata. */
  beatGridPcts?: number[];
  /** When set, beat lines are hidden if confidence is below the standard threshold (defense in depth). */
  beatGrid?: BeatGridMetadata | null;
  /** Optional: per-stem time-domain analyser for live waveform modulation. */
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  /** Whether audio is currently playing (gates the analyser modulation). */
  isPlaying?: boolean;
  onTrimChange: (stemId: string, trim: TrimState) => void;
  onSeek: (pct: number, opts?: { phase?: SeekPhase }) => void;
  onActivate: (stemId: string) => void;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

const WaveformLaneMemo = memo(WaveformLane);

export function WaveformTimeline({
  stems,
  waveforms,
  durations,
  stemStates,
  isLoadingStems: _isLoadingStems,
  zoom,
  scrollPct,
  activeStemId,
  playheadVisiblePct,
  showPlayhead,
  tickPcts,
  beatGridPcts,
  beatGrid,
  getStemAnalyserTimeDomainData,
  isPlaying = false,
  onTrimChange,
  onSeek,
  onActivate,
  onStemStateChange,
}: WaveformTimelineProps) {
  const fakeWaveforms = useMemo(
    () => Object.fromEntries(stems.map((s) => [s.id, generateFakeWaveform(s.id, WAVEFORM_BINS)])),
    [stems]
  );

  const displayBeatGridPcts = useMemo(() => {
    if (!beatGridPcts?.length) return [];
    if (beatGrid != null && !shouldRenderBeatGrid(beatGrid)) return [];
    return beatGridPcts;
  }, [beatGrid, beatGridPcts]);

  return (
    <div className="relative flex flex-col gap-1.5">
      {/* Time grid lines — faint vertical guides aligned to ruler ticks */}
      {tickPcts && tickPcts.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          {tickPcts.map((pct) => (
            <div
              key={pct}
              className="absolute inset-y-0 w-px bg-white/[0.05]"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>
      )}

      {/* Beat grid lines — amber markers from backend BPM analysis */}
      {displayBeatGridPcts.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          {displayBeatGridPcts.map((pct, i) => (
            <div
              key={i}
              className="absolute inset-y-0 w-px bg-amber-400/25"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>
      )}

      {stems.map((stem) => {
        const waveform = waveforms[stem.id];
        const hasWaveform = Boolean(waveform && waveform.length > 0);
        const state = stemStates[stem.id] ?? defaultStemState();
        const audioReady = (durations[stem.id] ?? 0) > 0;
        const isWaveformLoading = !hasWaveform || !audioReady;

        return (
          <WaveformLaneMemo
            key={stem.id}
            stem={stem}
            waveform={waveform ?? fakeWaveforms[stem.id] ?? []}
            trim={state.trim}
            mixer={state.mixer}
            isActive={stem.id === activeStemId}
            isMuted={state.muted}
            isSoloed={state.soloed}
            isLoading={isWaveformLoading && stems.length > 0}
            audioReady={audioReady}
            zoom={zoom}
            scrollPct={scrollPct}
            playheadFraction={playheadVisiblePct / 100}
            getAnalyserData={
              isPlaying && getStemAnalyserTimeDomainData
                ? () => getStemAnalyserTimeDomainData(stem.id)
                : undefined
            }
            fadeIn={state.fadeIn ?? 0}
            fadeOut={state.fadeOut ?? 0}
            duration={durations[stem.id] ?? 0}
            onTrimChange={onTrimChange}
            onSeek={onSeek}
            onActivate={onActivate}
            onStemStateChange={onStemStateChange}
          />
        );
      })}

      {showPlayhead && (
        <div
          className="waveform-global-playhead-line pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
          style={playheadPercentStyle(playheadVisiblePct)}
        />
      )}
    </div>
  );
}
