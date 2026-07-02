import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import type { ProcessConfig, QualityMetrics } from "../../utils/midiProcessing";
import { applyProcessing, calculateQualityMetrics } from "../../utils/midiProcessing";
import type { EditableNote, SnapGrid, TimeSignature } from "./editorTypes";
import { MidiRhythmGroovePanel } from "./MidiRhythmGroovePanel";

interface MidiProcessDialogProps {
  open: boolean;
  onClose: () => void;
  notes: EditableNote[];
  bpm: number;
  snapGrid: SnapGrid;
  timeSignature: TimeSignature;
  onApply: (notes: EditableNote[]) => void;
  onInsertGroove?: (
    notes: EditableNote[],
    styleLabel: string,
    mode?: "new-track" | "active-track",
  ) => void;
}

export function MidiProcessDialog({
  open,
  onClose,
  notes,
  bpm,
  snapGrid,
  timeSignature,
  onApply,
  onInsertGroove,
}: MidiProcessDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<ProcessConfig>({
    velocity: { enabled: true, targetMin: 40, targetMax: 110 },
    filter: { enabled: false, minNoteLength: 0.05, maxNoteLength: 8 },
    quantize: { enabled: false, strength: 0.5 },
  });
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApplied(false);
      setMetrics(null);
      return;
    }
    setMetrics(calculateQualityMetrics(notes, bpm, snapGrid, timeSignature));
  }, [open, notes, bpm, snapGrid, timeSignature]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const preview = useCallback(() => {
    const result = applyProcessing(notes, config, bpm, snapGrid, timeSignature);
    setMetrics(result.metrics);
  }, [notes, config, bpm, snapGrid, timeSignature]);

  const handleApply = useCallback(() => {
    const result = applyProcessing(notes, config, bpm, snapGrid, timeSignature);
    setMetrics(result.metrics);
    setApplied(true);
    onApply(result.notes);
    onClose();
  }, [notes, config, bpm, snapGrid, timeSignature, onApply, onClose]);

  const originalCount = notes.length;
  const processedCount = metrics?.noteCount ?? originalCount;
  const removedCount = originalCount - processedCount;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center midi-backdrop-fade"
      style={{ background: "rgba(0,0,0,0.55)" }}
      role="button"
      tabIndex={0}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClose(); }}
    >
      <div
        ref={ref}
        className="midi-control-bar__overflow midi-dialog-enter"
        style={{
          position: "relative",
          top: "auto",
          right: "auto",
          minWidth: "22rem",
          maxWidth: "calc(100vw - 16px)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        role="dialog"
        aria-label="Process MIDI"
      >
        <div className="flex items-center justify-between mb-sm px-1">
          <span className="text-[11px] font-bold tracking-wide text-[var(--midi-text)]">
            Process MIDI
          </span>
          <button
            type="button"
            onClick={onClose}
            className="midi-control-bar__overflow-btn"
            style={{ width: "auto", padding: "2px 6px" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="midi-control-bar__overflow-divider" />

        {onInsertGroove ? (
          <>
            <MidiRhythmGroovePanel
              bpm={bpm}
              onInsertNotes={onInsertGroove}
            />
            <div className="midi-control-bar__overflow-divider" />
          </>
        ) : null}

        {/* Velocity normalization */}
        <label className="midi-control-bar__overflow-row cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.velocity?.enabled ?? false}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                velocity: { ...c.velocity!, enabled: e.target.checked },
              }))
            }
            className="accent-[var(--midi-accent)]"
          />
          <span className="midi-control-bar__overflow-label">Velocity</span>
        </label>
        {config.velocity?.enabled && (
          <div className="flex flex-col gap-1 px-1 pb-1">
            <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] text-[var(--midi-text-muted)] w-8">Min</span>
              <input
                type="range"
                min={1}
                max={127}
                value={config.velocity.targetMin}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    velocity: { ...c.velocity!, targetMin: Number(e.target.value) },
                  }))
                }
                className="midi-control-bar__overflow-slider"
              />
              <span className="w-6 text-right font-mono text-[10px] text-[var(--midi-text-muted)]">
                {config.velocity.targetMin}
              </span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] text-[var(--midi-text-muted)] w-8">Max</span>
              <input
                type="range"
                min={1}
                max={127}
                value={config.velocity.targetMax}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    velocity: { ...c.velocity!, targetMax: Number(e.target.value) },
                  }))
                }
                className="midi-control-bar__overflow-slider"
              />
              <span className="w-6 text-right font-mono text-[10px] text-[var(--midi-text-muted)]">
                {config.velocity.targetMax}
              </span>
            </div>
          </div>
        )}

        <div className="midi-control-bar__overflow-divider" />

        {/* Note filter */}
        <label className="midi-control-bar__overflow-row cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.filter?.enabled ?? false}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                filter: { ...c.filter!, enabled: e.target.checked },
              }))
            }
            className="accent-[var(--midi-accent)]"
          />
          <span className="midi-control-bar__overflow-label">Filter</span>
        </label>
        {config.filter?.enabled && (
          <div className="flex flex-col gap-1 px-1 pb-1">
            <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] text-[var(--midi-text-muted)] w-8">Min</span>
              <input
                type="range"
                min={0.01}
                max={2}
                step={0.01}
                value={config.filter.minNoteLength}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    filter: { ...c.filter!, minNoteLength: Number(e.target.value) },
                  }))
                }
                className="midi-control-bar__overflow-slider"
              />
              <span className="w-10 text-right font-mono text-[10px] text-[var(--midi-text-muted)]">
                {config.filter.minNoteLength.toFixed(2)}s
              </span>
            </div>
            <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] text-[var(--midi-text-muted)] w-8">Max</span>
              <input
                type="range"
                min={0.05}
                max={16}
                step={0.05}
                value={config.filter.maxNoteLength}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    filter: { ...c.filter!, maxNoteLength: Number(e.target.value) },
                  }))
                }
                className="midi-control-bar__overflow-slider"
              />
              <span className="w-10 text-right font-mono text-[10px] text-[var(--midi-text-muted)]">
                {config.filter.maxNoteLength.toFixed(2)}s
              </span>
            </div>
          </div>
        )}

        <div className="midi-control-bar__overflow-divider" />

        {/* Quantize */}
        <label className="midi-control-bar__overflow-row cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.quantize?.enabled ?? false}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                quantize: { ...c.quantize!, enabled: e.target.checked },
              }))
            }
            className="accent-[var(--midi-accent)]"
          />
          <span className="midi-control-bar__overflow-label">Quantize</span>
        </label>
        {config.quantize?.enabled && (
          <div className="flex items-center gap-2 px-3 pb-1">
            <span className="text-[10px] text-[var(--midi-text-muted)]">Strength</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(config.quantize.strength * 100)}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  quantize: { ...c.quantize!, strength: Number(e.target.value) / 100 },
                }))
              }
              className="midi-control-bar__overflow-slider"
            />
            <span className="w-8 text-right font-mono text-[10px] text-[var(--midi-text-muted)]">
              {Math.round(config.quantize.strength * 100)}%
            </span>
          </div>
        )}

        <div className="midi-control-bar__overflow-divider" />

        {/* Metrics */}
        {metrics && (
          <div className="px-2 py-1 text-[10px]">
            <div className="font-semibold text-[var(--midi-text-muted)] uppercase tracking-wide mb-1">
              Quality
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <MetricRow label="Notes" value={`${metrics.noteCount}`} />
              {removedCount > 0 && (
                <MetricRow label="Removed" value={`-${removedCount}`} warn />
              )}
              <MetricRow
                label="Timing"
                value={`${Math.round(metrics.timingAccuracy * 100)}%`}
              />
              <MetricRow
                label="Velocity"
                value={`${Math.round(metrics.velocityConsistency * 100)}%`}
              />
              <MetricRow
                label="Density"
                value={`${metrics.noteDensity.toFixed(1)}/s`}
              />
              <MetricRow
                label="Rhythm"
                value={`${Math.round(metrics.rhythmicComplexity * 100)}%`}
              />
            </div>
          </div>
        )}

        <div className="midi-control-bar__overflow-divider" />

        {/* Actions */}
        <div className="flex gap-2 px-1 pt-1">
          <button
            type="button"
            onClick={preview}
            className={cn(
              "midi-control-bar__overflow-btn",
              "justify-center text-[11px]",
            )}
            style={{ width: "auto", flex: 1 }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={cn(
              "midi-control-bar__overflow-btn",
              "justify-center text-[11px] font-bold",
            )}
            style={{
              width: "auto",
              flex: 1,
              background: "var(--midi-border-accent)",
              color: "var(--midi-text)",
            }}
          >
            {applied ? "Re-apply" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--midi-text-muted)]">{label}</span>
      <span
        className={cn(
          "font-mono font-semibold tabular-nums",
          warn ? "text-orange-400" : "text-[var(--midi-text)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
