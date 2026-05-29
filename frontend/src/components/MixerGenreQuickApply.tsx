/**
 * One-click genre mixer presets (Rock / Hip Hop / Electronic).
 */
import { useCallback, useEffect, useState } from "react";
import {
  loadGenreMixerPresets,
  type GenreMixerPreset,
} from "../data/mixerGenrePresets";
import type { MixerPreset } from "./MixerPresetsModal";
import { cn } from "../utils/cn";

export interface MixerGenreQuickApplyProps {
  onApply: (preset: MixerPreset) => void;
  className?: string;
}

export function MixerGenreQuickApply({
  onApply,
  className,
}: MixerGenreQuickApplyProps) {
  const [presets, setPresets] = useState<GenreMixerPreset[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadGenreMixerPresets().then((list) => {
      if (!cancelled) setPresets(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(
    (g: GenreMixerPreset) => {
      onApply({
        id: g.id,
        name: g.name,
        createdAt: Date.now(),
        mixerState: g.mixerState,
        trimMap: {},
        mutedStems: {},
        pitchMap: {},
        timeStretchMap: {},
      });
    },
    [onApply],
  );

  if (presets.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-xs", className)}
      role="group"
      aria-label="Genre mixer presets"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Genre mix
      </span>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => apply(p)}
          title={p.description}
          className="tap-feedback rounded-full border border-border bg-muted px-sm py-1 text-xs font-medium text-secondary-foreground transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-100"
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
