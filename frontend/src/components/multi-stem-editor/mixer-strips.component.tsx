/**
 * MixerStrips — Horizontal arrangement of vertical channel strips.
 *
 * Renders all stems as evenly-spaced vertical channel strips in a
 * horizontally-scrollable container. Follows standard DAW mixer layout
 * conventions for quick scanning and muscle memory.
 */
import { memo } from "react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
import { ChannelStrip } from "./channel-strip.component";

export interface MixerStripsProps {
  stems: StemDefinition[];
  /** When set, shows a layout hint above the strip row. */
  stemLayout?: 2 | 4 | null;
  stemStates: Record<string, StemEditorState>;
  activeStemId: string;
  playbackReady: boolean;
  isLoadingStems: boolean;
  isPlayingMix: boolean;
  playingStemId: string | null;
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  loadingPreviewStemId: string | null;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  onActiveStemChange: (stemId: string) => void;
}

const LAYOUT_LABELS: Record<2 | 4, string> = {
  2: "Vocals + Instrumental",
  4: "Full band — Drums · Bass · Other · Vocals",
};

export const MixerStrips = memo(function MixerStrips({
  stems,
  stemLayout = null,
  stemStates,
  activeStemId,
  playbackReady,
  isLoadingStems: _isLoadingStems,
  isPlayingMix,
  playingStemId,
  getStemAnalyserTimeDomainData,
  loadingPreviewStemId,
  onStemStateChange,
  onPreviewStem,
  onActiveStemChange,
}: MixerStripsProps) {
  if (stems.length === 0) return null;

  return (
    <div className="w-full">
      {stemLayout != null && (
        <p className="mb-2 flex items-center gap-2 text-xs text-white/55">
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/90">
            {stemLayout}-stem
          </span>
          {LAYOUT_LABELS[stemLayout]}
        </p>
      )}
    <div
      className="flex gap-2 overflow-x-auto overflow-y-visible pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      role="region"
      aria-label="Mixer channel strips"
    >
      {stems.map((stem) => {
        const state = stemStates[stem.id] ?? defaultStemState();
        return (
          <ChannelStrip
            key={stem.id}
            stem={stem}
            state={state}
            isActive={stem.id === activeStemId}
            audioReady={playbackReady}
            isPreviewPlaying={playingStemId === stem.id}
            isLoadingPreview={loadingPreviewStemId === stem.id}
            isMeterPlaying={
              playbackReady && (isPlayingMix || playingStemId === stem.id)
            }
            getStemAnalyserData={getStemAnalyserTimeDomainData}
            onStemStateChange={onStemStateChange}
            onPreviewStem={onPreviewStem}
            onActivate={onActiveStemChange}
          />
        );
      })}
    </div>
    </div>
  );
});
