/**
 * One-click vocal cleanup preset (EQ carve + compression + light FX).
 */
import type { MixerPreset } from "./MixerPresetsModal";
import { VOCAL_CLEANUP_PRESET } from "../data/vocalCleanupPreset";
import { cn } from "../utils/cn";

export interface VocalCleanupQuickApplyProps {
  onApply: (preset: MixerPreset) => void;
  className?: string;
}

export function VocalCleanupQuickApply({
  onApply,
  className,
}: VocalCleanupQuickApplyProps) {
  return (
    <button
      type="button"
      onClick={() =>
        onApply({
          ...VOCAL_CLEANUP_PRESET,
          createdAt: Date.now(),
        })
      }
      title="Subtractive EQ, transparent compression, and light reverb/delay for lead vocals. Check balance in mono before widening."
      className={cn(
        "tap-feedback rounded-full border border-primary-400/40 bg-primary-500/15 px-sm py-1 text-xs font-medium text-primary-100 transition hover:border-primary-400/55 hover:bg-primary-500/25",
        className,
      )}
    >
      Vocal cleanup
    </button>
  );
}
