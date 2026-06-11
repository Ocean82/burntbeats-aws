/**
 * VariationControlBar — Three buttons (Fill, Breakdown, Buildup) for applying
 * algorithmic variations to the active overlay pattern.
 *
 * Disabled when no overlay pattern is active.
 */
import { Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import type { VariationType } from "../../audio/genrePresets";

// ─── Props ────────────────────────────────────────────────────────

export interface VariationControlBarProps {
  onApply: (type: VariationType) => void;
  activeVariation: VariationType | null;
  disabled: boolean;
}

// ─── Component ────────────────────────────────────────────────────

const VARIATION_TYPES: VariationType[] = ["fill", "breakdown", "buildup"];

export function VariationControlBar({ onApply, activeVariation, disabled }: VariationControlBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Pattern variation controls"
      className="inline-flex items-center gap-1"
    >
      <span className="text-[9px] text-muted-foreground mr-1">Variations:</span>
      {VARIATION_TYPES.map((type) => {
        const isActive = activeVariation === type;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onApply(type)}
            aria-pressed={isActive}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-[color,background-color] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed",
              isActive
                ? "border-accent-midi-400/60 bg-accent-midi/15 text-accent-midi-200"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Sparkles className="h-3 w-3 mr-0.5 inline" />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
