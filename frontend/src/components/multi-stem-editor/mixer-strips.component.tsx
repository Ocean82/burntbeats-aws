/**
 * MixerStrips — Horizontal arrangement of vertical channel strips.
 *
 * Renders all stems as evenly-spaced vertical channel strips in a
 * horizontally-scrollable container. Follows standard DAW mixer layout
 * conventions for quick scanning and muscle memory.
 */
import { memo, useMemo } from "react";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { defaultStemState } from "../../stem-editor-state";
import { ChannelStrip } from "./channel-strip.component";
import { isStemModified } from "../../utils/isStemModified";

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
  onResetSingleStem?: (stemId: string) => void;
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
  isLoadingStems,
  isPlayingMix,
  playingStemId,
  getStemAnalyserTimeDomainData,
  loadingPreviewStemId,
  onStemStateChange,
  onPreviewStem,
  onActiveStemChange,
  onResetSingleStem,
}: MixerStripsProps) {
  const modifiedById = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const stem of stems) {
      map[stem.id] = isStemModified(stemStates[stem.id] ?? defaultStemState());
    }
    return map;
  }, [stems, stemStates]);

  if (stems.length === 0) return null;

  return (
    <div className="w-full">
      {stemLayout != null && (
        <p className="mb-xs flex items-center gap-xs text-xs text-muted-foreground">
          <span className="rounded-full border border-primary-400/30 bg-primary-500/10 px-xs py-0.5 text-meta font-bold uppercase tracking-wide text-primary-200/90">
            {stemLayout}-stem
          </span>
          {LAYOUT_LABELS[stemLayout]}
        </p>
      )}
    <div
      className="flex gap-xs overflow-x-auto overflow-y-visible pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      role="region"
      aria-label="Mixer channel strips"
      aria-busy={isLoadingStems}
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
            onResetStem={onResetSingleStem}
            isModified={modifiedById[stem.id]}
          />
        );
      })}
    </div>
    </div>
  );
});
