/**
 * MarkerStrip — section markers for the MIDI editor timeline.
 */
import { Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../../utils/cn";

export interface SectionMarker {
  id: string;
  time: number;
  label: string;
}

export interface MarkerStripProps {
  markers: SectionMarker[];
  duration: number;
  pixelsPerSecond: number;
  defaultAddTime?: number;
  markerExportSupported?: boolean;
  onAdd: (time: number, label: string) => void;
  onRemove: (id: string) => void;
  onSeek?: (time: number) => void;
  className?: string;
}

let markerId = 1;

export function MarkerStrip({
  markers,
  duration,
  pixelsPerSecond,
  defaultAddTime = 0,
  markerExportSupported = true,
  onAdd,
  onRemove,
  onSeek,
  className,
}: MarkerStripProps) {
  const [newLabel, setNewLabel] = useState("Section");

  const handleAdd = useCallback(() => {
    const time = Math.max(0, Math.min(duration, defaultAddTime));
    onAdd(time, newLabel.trim() || "Section");
  }, [defaultAddTime, duration, newLabel, onAdd]);

  const width = Math.max(200, duration * pixelsPerSecond);

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30", className)}>
      <div className="flex items-center justify-between gap-xs border-b border-border/60 px-sm py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Markers
        </span>
        <div className="flex items-center gap-xs">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-24 rounded border border-border bg-muted px-xs py-0.5 text-[10px]"
            aria-label="Marker label"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-0.5 rounded px-xs py-0.5 text-[10px] text-accent-midi-300 hover:bg-accent-midi/10"
            aria-label="Add marker"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>
      <p className="border-b border-border/40 px-sm py-0.5 text-[9px] text-muted-foreground">
        {markerExportSupported
          ? "Markers export with Download / Save when supported by your DAW."
          : "Markers are session-only — export is unavailable in this browser."}
      </p>
      <div className="relative h-8 overflow-x-auto">
        <div className="relative h-full" style={{ width }}>
          {markers.map((m) => (
            <div
              key={m.id}
              className="group absolute top-0 flex h-full flex-col items-center"
              style={{ left: m.time * pixelsPerSecond }}
            >
              <button
                type="button"
                onClick={() => onSeek?.(m.time)}
                className="h-3 w-0.5 bg-primary-400 hover:bg-primary-300"
                title={`${m.label} @ ${m.time.toFixed(1)}s`}
                aria-label={`Go to ${m.label}`}
              />
              <span className="mt-0.5 max-w-[72px] truncate text-[9px] text-primary-200">
                {m.label}
              </span>
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                className="absolute -right-1 -top-0.5 hidden rounded bg-destructive-900/80 p-0.5 text-destructive-200 group-hover:block"
                aria-label={`Remove ${m.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function createMarker(time: number, label: string): SectionMarker {
  return { id: `mk_${markerId++}`, time, label };
}
