import { cn } from "../../utils/cn";
import type { StemDefinition } from "../../types";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";
import { isStemModified } from "../../utils/isStemModified";

interface StemTabsProps {
  stems: StemDefinition[];
  activeStemId: string;
  stemStates: Record<string, StemEditorState>;
  onSelectStem: (stemId: string) => void;
}

export function StemTabs({ stems, activeStemId, stemStates, onSelectStem }: StemTabsProps) {
  return (
    <div className="flex gap-1.5 flex-wrap border-t border-white/10 pt-3">
      {stems.map((stem) => {
        const state = stemStates[stem.id] ?? defaultStemState();
        const selected = stem.id === activeStemId;
        const modified = isStemModified(state);
        return (
          <button
            key={stem.id}
            type="button"
            onClick={() => onSelectStem(stem.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              selected
                ? "border-current text-white"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white/80",
              state.muted && "opacity-50"
            )}
            style={selected ? { borderColor: stem.glow, background: `${stem.glow}18`, color: stem.glow } : {}}
            aria-label={
              modified ? `${stem.label} (modified)` : stem.label
            }
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full ring-2 ring-transparent",
                modified && "ring-amber-400/70",
              )}
              style={{ backgroundColor: stem.glow, boxShadow: selected ? `0 0 6px ${stem.glow}` : "none" }}
            />
            {stem.label}
            {state.muted && <span className="text-[9px] opacity-60">M</span>}
            {state.soloed && <span className="text-[9px] text-amber-300">S</span>}
          </button>
        );
      })}
    </div>
  );
}
