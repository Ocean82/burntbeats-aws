/**
 * VariationControlBar — Overlay layer variation controls (Fill, Breakdown, Buildup).
 */
import { Lock, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import type { VariationType } from "../../audio/patternVariations";

export interface VariationControlBarProps {
  onApply: (type: VariationType) => void;
  activeVariation: VariationType | null;
  disabled: boolean;
  canUseVariations: boolean;
  onUpgradeRequest?: () => void;
}

const VARIATION_TYPES: VariationType[] = ["fill", "breakdown", "buildup"];

export function VariationControlBar({
  onApply,
  activeVariation,
  disabled,
  canUseVariations,
  onUpgradeRequest,
}: VariationControlBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Overlay pattern variation controls"
      className="inline-flex items-center gap-1"
    >
      <span className="text-[9px] text-muted-foreground mr-1">Overlay variations:</span>
      {VARIATION_TYPES.map((type) => {
        const isActive = activeVariation === type;
        const isLocked = !canUseVariations;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled && !isLocked}
            onClick={() => {
              if (isLocked) {
                onUpgradeRequest?.();
                return;
              }
              onApply(type);
            }}
            aria-pressed={isActive}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-[color,background-color] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isLocked && "opacity-50",
              !disabled && !isLocked && "hover:bg-muted hover:text-foreground",
              disabled && !isLocked && "opacity-40 cursor-not-allowed",
              isActive
                ? "border-accent-midi-400/60 bg-accent-midi/15 text-accent-midi-200"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
            title={
              isLocked
                ? `Upgrade to unlock overlay ${type} variations`
                : disabled
                  ? "Select an overlay pattern first"
                  : `Apply ${type} to overlay layer`
            }
          >
            {isLocked ? (
              <Lock className="h-3 w-3 mr-0.5 inline" />
            ) : (
              <Sparkles className="h-3 w-3 mr-0.5 inline" />
            )}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
