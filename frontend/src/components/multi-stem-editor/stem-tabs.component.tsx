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
    <div className="flex gap-xs flex-wrap border-t border-border pt-sm">
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
              "tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg border px-sm py-xs text-xs font-medium transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              selected
                ? "border-current text-foreground"
                : "border-border bg-muted text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground",
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
                modified && "ring-primary-400/70",
              )}
              style={{ backgroundColor: stem.glow, boxShadow: selected ? `0 0 6px ${stem.glow}` : "none" }}
            />
            {stem.label}
            {state.muted && <span className="text-meta opacity-60" aria-hidden>M</span>}
            {state.soloed && <span className="text-meta text-primary-300" aria-hidden>S</span>}
          </button>
        );
      })}
    </div>
  );
}
