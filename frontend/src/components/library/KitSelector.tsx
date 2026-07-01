import { useMemo, useCallback } from "react";
import { cn } from "../../utils/cn";
import { KIT_PRESETS, type KitId } from "../../audio/types";

interface KitSelectorProps {
  value: KitId;
  onChange: (id: KitId) => void;
  disabled?: boolean;
}

export function KitSelector({ value, onChange, disabled }: KitSelectorProps) {
  const presets = useMemo(() => KIT_PRESETS, []);
  const currentIndex = presets.findIndex((p) => p.id === value);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const next =
        e.key === "ArrowRight"
          ? (currentIndex + 1) % presets.length
          : e.key === "ArrowLeft"
            ? (currentIndex - 1 + presets.length) % presets.length
            : -1;
      if (next >= 0) {
        e.preventDefault();
        onChange(presets[next].id);
        const btn = e.currentTarget.querySelector(`[data-kit-id="${presets[next].id}"]`) as HTMLElement | null;
        btn?.focus();
      }
    },
    [disabled, currentIndex, presets, onChange],
  );

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Drum kit"
      aria-orientation="horizontal"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
    >
      {presets.map((preset) => {
        const isActive = value === preset.id;
        return (
          <button
            key={preset.id}
            data-kit-id={preset.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(preset.id)}
            className={cn(
              "relative h-8 px-3 rounded-md text-xs font-medium transition-all duration-150 border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60",
              isActive
                ? "border-primary-500/50 bg-primary-500/15 text-primary-300 shadow-[0_0_12px_rgba(0,0,0,0.3)]"
                : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
              disabled && "opacity-40 cursor-not-allowed",
            )}
            style={isActive ? { boxShadow: `0 0 14px ${preset.color}22` } : undefined}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: preset.color, opacity: isActive ? 1 : 0.5 }}
                aria-hidden
              />
              {preset.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
