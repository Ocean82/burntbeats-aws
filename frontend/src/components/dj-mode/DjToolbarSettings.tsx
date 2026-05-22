/**
 * DjToolbarSettings — Panel for configuring which mixer tools are visible in DJ mode.
 */
import { Eye, EyeOff, RotateCcw, X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { DjToolId, DjToolSlot } from "../../hooks/useDjToolbarConfig";

interface DjToolbarSettingsProps {
  slots: DjToolSlot[];
  onToggle: (id: DjToolId) => void;
  onReset: () => void;
  onClose: () => void;
}

export function DjToolbarSettings({
  slots,
  onToggle,
  onReset,
  onClose,
}: DjToolbarSettingsProps) {
  return (
    <div className="border-t border-border/[0.06] bg-secondary px-md py-sm">
      <div className="flex items-center justify-between mb-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Visible Tools
        </span>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2xs text-[9px] text-muted-foreground hover:text-foreground transition"
            aria-label="Reset to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Close settings"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2xs" role="list" aria-label="Mixer tool configuration">
        {slots.map((slot) => (
          <div
            key={slot.id}
            role="listitem"
            className={cn(
              "flex items-center gap-xs rounded-md px-xs py-1.5 transition",
              slot.visible ? "bg-muted/[0.04]" : "opacity-50",
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(slot.id)}
              className="text-muted-foreground hover:text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 rounded"
              aria-label={slot.visible ? `Hide ${slot.label}` : `Show ${slot.label}`}
            >
              {slot.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <span className="flex-1 text-xs text-secondary-foreground">{slot.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
