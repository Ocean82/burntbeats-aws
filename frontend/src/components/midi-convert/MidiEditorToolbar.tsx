/**
 * MidiEditorToolbar — tool selection, snap grid, velocity, undo/redo, export.
 */
import {
  Download,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { EditorTool, SnapGrid } from "../../hooks/useMidiEditor";

interface MidiEditorToolbarProps {
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  drawVelocity: number;
  canUndo: boolean;
  canRedo: boolean;
  isModified: boolean;
  onToolChange: (tool: EditorTool) => void;
  onSnapGridChange: (grid: SnapGrid) => void;
  onBpmChange: (bpm: number) => void;
  onDrawVelocityChange: (vel: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onReset: () => void;
}

const TOOLS: { id: EditorTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "erase", label: "Erase", icon: Eraser },
];

const GRIDS: { value: SnapGrid; label: string }[] = [
  { value: "1/4", label: "1/4" },
  { value: "1/8", label: "1/8" },
  { value: "1/16", label: "1/16" },
  { value: "1/32", label: "1/32" },
  { value: "free", label: "Free" },
];

export function MidiEditorToolbar({
  tool,
  snapGrid,
  bpm,
  drawVelocity,
  canUndo,
  canRedo,
  isModified,
  onToolChange,
  onSnapGridChange,
  onBpmChange,
  onDrawVelocityChange,
  onUndo,
  onRedo,
  onExport,
  onReset,
}: MidiEditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-950/30 px-3 py-2">
      {/* Tool buttons */}
      <div className="flex items-center gap-1" role="toolbar" aria-label="Editor tools">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onToolChange(id)}
            aria-label={label}
            aria-pressed={tool === id}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition",
              tool === id
                ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-white/10" aria-hidden />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:border-white/20 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:border-white/20 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="h-5 w-px bg-white/10" aria-hidden />

      {/* Snap grid */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Snap
        </span>
        <select
          value={snapGrid}
          onChange={(e) => onSnapGridChange(e.target.value as SnapGrid)}
          className="h-7 rounded border border-violet-400/30 bg-violet-950/50 px-1.5 text-xs text-white/80 focus:border-violet-400 focus:outline-none"
          aria-label="Snap grid"
        >
          {GRIDS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          BPM
        </span>
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) onBpmChange(val);
          }}
          className="h-7 w-14 rounded border border-violet-400/30 bg-violet-950/50 px-1.5 text-center text-xs text-white/80 focus:border-violet-400 focus:outline-none"
          aria-label="BPM"
        />
      </div>

      <div className="h-5 w-px bg-white/10" aria-hidden />

      {/* Velocity slider */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Vel
        </span>
        <input
          type="range"
          min={1}
          max={127}
          value={drawVelocity}
          onChange={(e) => onDrawVelocityChange(parseInt(e.target.value, 10))}
          className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400"
          aria-label="Draw velocity"
        />
        <span className="w-6 text-center font-mono text-[10px] text-white/50">
          {drawVelocity}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reset */}
      {isModified && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs text-white/50 transition hover:border-white/20 hover:text-white/80"
          aria-label="Reset to original"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      )}

      {/* Export */}
      <button
        type="button"
        onClick={onExport}
        className="flex h-8 items-center gap-1.5 rounded-md border border-violet-300/40 bg-violet-600/25 px-3 text-xs font-semibold text-white transition hover:bg-violet-600/40"
        aria-label="Export edited MIDI"
      >
        <Download className="h-3.5 w-3.5" />
        Export .mid
      </button>
    </div>
  );
}
