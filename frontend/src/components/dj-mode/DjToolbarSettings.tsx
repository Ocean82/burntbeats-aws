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
    <div className="border-t border-white/[0.06] bg-black/60 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
          Visible Tools
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-[9px] text-white/40 hover:text-white transition"
            aria-label="Reset to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition"
            aria-label="Close settings"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1" role="list" aria-label="Mixer tool configuration">
        {slots.map((slot) => (
          <div
            key={slot.id}
            role="listitem"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 transition",
              slot.visible ? "bg-white/[0.04]" : "opacity-50",
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(slot.id)}
              className="text-white/50 hover:text-white transition"
              aria-label={slot.visible ? `Hide ${slot.label}` : `Show ${slot.label}`}
            >
              {slot.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <span className="flex-1 text-xs text-white/70">{slot.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
