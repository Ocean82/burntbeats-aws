import { memo, useMemo } from "react";
import type { StemDefinition, TrimState } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
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
  /** Optional: time-domain analyser data for live waveform modulation during playback. */
  getAnalyserData?: () => Uint8Array | null;
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
  isLoadingStems,
  zoom,
  scrollPct,
  activeStemId,
  playheadVisiblePct,
  showPlayhead,
  getAnalyserData,
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

  return (
    <div className="relative flex flex-col gap-1.5">
      {stems.map((stem) => {
        const waveform = waveforms[stem.id];
        const hasWaveform = Boolean(waveform && waveform.length > 0);
        const state = stemStates[stem.id] ?? defaultStemState();
        const isWaveformLoading = isLoadingStems || !hasWaveform;
        const audioReady = (durations[stem.id] ?? 0) > 0;

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
            getAnalyserData={isPlaying ? getAnalyserData : undefined}
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
