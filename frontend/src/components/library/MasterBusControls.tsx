/**
 * MasterBusControls — Volume sliders for the grid pattern and overlay pattern.
 *
 * Displays two range sliders (0.0–1.0, step 0.01) for independent volume control
 * of the grid and overlay audio buses. Designed to sit near the transport controls.
 */
import { cn } from "../../utils/cn";

// ─── Props ────────────────────────────────────────────────────────

export interface MasterBusControlsProps {
  gridVolume: number;
  overlayVolume: number;
  onGridVolumeChange: (vol: number) => void;
  onOverlayVolumeChange: (vol: number) => void;
}

// ─── Component ────────────────────────────────────────────────────

export function MasterBusControls({
  gridVolume,
  overlayVolume,
  onGridVolumeChange,
  onOverlayVolumeChange,
}: MasterBusControlsProps) {
  return (
    <div
      className="inline-flex flex-col gap-2 rounded-xl border border-border bg-muted p-3"
      role="group"
      aria-label="Master bus volume controls"
    >
      {/* Grid Volume */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16 font-medium text-foreground">Grid</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={gridVolume}
          onChange={(e) => onGridVolumeChange(Number(e.target.value))}
          className="w-24 accent-primary-400"
          aria-label="Grid volume"
        />
        <span
          className={cn(
            "w-10 text-right tabular-nums",
            gridVolume === 0 && "text-error",
          )}
        >
          {Math.round(gridVolume * 100)}%
        </span>
      </label>

      {/* Overlay Volume */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-16 font-medium text-foreground">Overlay</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={overlayVolume}
          onChange={(e) => onOverlayVolumeChange(Number(e.target.value))}
          className="w-24 accent-primary-400"
          aria-label="Overlay volume"
        />
        <span
          className={cn(
            "w-10 text-right tabular-nums",
            overlayVolume === 0 && "text-error",
          )}
        >
          {Math.round(overlayVolume * 100)}%
        </span>
      </label>
    </div>
  );
}
