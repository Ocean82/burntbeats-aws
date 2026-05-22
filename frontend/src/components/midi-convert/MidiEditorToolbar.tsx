/**
 * MIDI editor tool row — tools, snap, undo, draw velocity, export.
 */
import {
  Download,
  Eraser,
  Magnet,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { EditorTool, SnapGrid } from "../../hooks/useMidiEditor";
import { EDITOR_TOOLS } from "./pianoRollTheme";
import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";
import { MidiPhysicalFader } from "./controls/MidiPhysicalFader";

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

const TOOLS: { id: EditorTool; icon: typeof MousePointer2 }[] = [
  { id: "select", icon: MousePointer2 },
  { id: "draw", icon: Pencil },
  { id: "erase", icon: Eraser },
];

const GRIDS: { value: SnapGrid; label: string }[] = [
  { value: "1/4", label: "1/4" },
  { value: "1/8", label: "1/8" },
  { value: "1/16", label: "1/16" },
  { value: "1/32", label: "1/32" },
  { value: "free", label: "Off" },
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
    <div className="flex flex-wrap items-center gap-xs">
      <div
        className="inline-flex rounded-md border border-border p-0.5"
        style={{ background: "var(--midi-surface-inset)" }}
        role="toolbar"
        aria-label="Editor tools"
      >
        {TOOLS.map(({ id, icon: Icon }) => {
          const meta = EDITOR_TOOLS[id];
          return (
            <MidiPhysicalButton
              key={id}
              variant="tool"
              pressed={tool === id}
              onClick={() => onToolChange(id)}
              title={`${meta.label} (${meta.shortcut}) — ${meta.hint}`}
              aria-label={meta.label}
              className="!min-w-[2rem] !px-xs"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{meta.label}</span>
            </MidiPhysicalButton>
          );
        })}
      </div>

      <div className="h-5 w-px bg-muted" aria-hidden />

      <MidiPhysicalButton
        variant="icon"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </MidiPhysicalButton>
      <MidiPhysicalButton
        variant="icon"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </MidiPhysicalButton>

      <div className="h-5 w-px bg-muted" aria-hidden />

      <div className="flex items-center gap-xs" title="Grid snap">
        <Magnet
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            snapGrid === "free" ? "text-muted-foreground" : "text-success-400/90",
          )}
          aria-hidden
        />
        <select
          value={snapGrid}
          onChange={(e) => onSnapGridChange(e.target.value as SnapGrid)}
          className="midi-select"
          aria-label="Snap to grid"
        >
          {GRIDS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--midi-text-muted)]">
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
          className="midi-input-num"
          aria-label="BPM"
        />
      </div>

      <MidiPhysicalFader
        label="Draw"
        min={1}
        max={127}
        value={drawVelocity}
        onChange={onDrawVelocityChange}
        ariaLabel="Draw velocity for new notes"
      />

      <div className="flex-1" />

      {isModified && (
        <MidiPhysicalButton
          onClick={onReset}
          title="Discard edits and restore converted notes"
          aria-label="Revert to original"
        >
          <RotateCcw className="h-3 w-3" />
          Revert
        </MidiPhysicalButton>
      )}

      <MidiPhysicalButton
        variant="play"
        onClick={onExport}
        title="Download edited MIDI file"
        aria-label="Export edited MIDI"
      >
        <Download className="h-3.5 w-3.5" />
        Export .mid
      </MidiPhysicalButton>
    </div>
  );
}
