import { memo, useMemo } from "react";
import type { StemDefinition } from "../../types";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";

export interface MixerConsoleProps {
  stems: StemDefinition[];
  stemStates: Record<string, StemEditorState>;
  playheadPct: number;
  isPlaying: boolean;
  playingStemId: string | null;
  activeStemId: string;
}

export const MixerConsole = memo(function MixerConsole({
  stems,
  stemStates,
  playheadPct,
  isPlaying,
  playingStemId,
  activeStemId,
}: MixerConsoleProps) {
  const snapshot = useMemo(() => {
    const stemSummary = stems.map((stem) => {
      const state = stemStates[stem.id] ?? defaultStemState();
      return {
        id: stem.id,
        label: stem.label,
        muted: state.muted,
        soloed: state.soloed,
        gainDb: state.mixer.gain,
        pan: state.mixer.pan,
        trim: state.trim,
        rate: state.rate,
      };
    });
    return {
      playheadPct,
      isPlaying,
      playingStemId,
      activeStemId,
      stemSummary,
      stemStates,
    };
  }, [stems, stemStates, playheadPct, isPlaying, playingStemId, activeStemId]);

  return (
    <section
      aria-label="Mixer debug console"
      className="rounded-xl border border-amber-400/20 bg-black/55 p-3"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
        Mixer console
      </p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-white/75">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </section>
  );
});
