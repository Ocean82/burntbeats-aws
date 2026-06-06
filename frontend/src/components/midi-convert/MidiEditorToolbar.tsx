import {
  Copy,
  Download,
  Eraser,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { EditorTool, SnapGrid, TimeSignature, ActiveLane } from "./editorTypes";
import { EDITOR_TOOLS } from "./pianoRollTheme";

import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";
import { MidiPhysicalFader } from "./controls/MidiPhysicalFader";

interface MidiEditorToolbarProps {
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  timeSignature: TimeSignature;
  drawVelocity: number;
  canUndo: boolean;
  canRedo: boolean;
  isModified: boolean;
  hasSelection: boolean;
  zoomLevel: number;
  metronomeEnabled: boolean;
  activeLane: ActiveLane;
  canSaveToJob: boolean;
  isSaving?: boolean;
  onToolChange: (tool: EditorTool) => void;
  onSnapGridChange: (grid: SnapGrid) => void;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (ts: TimeSignature) => void;
  onDrawVelocityChange: (vel: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleMetronome: () => void;
  onQuantizeSelection: () => void;
  onDuplicateSelection: () => void;
  onActiveLaneChange: (lane: ActiveLane) => void;
  onSaveToJob?: () => void;
}

const TOOLS: { id: EditorTool; icon: typeof MousePointer2 }[] = [
  { id: "select", icon: MousePointer2 },
  { id: "draw", icon: Pencil },
  { id: "erase", icon: Eraser },
  { id: "split", icon: Scissors },
];

const GRIDS: { value: SnapGrid; label: string }[] = [
  { value: "1/4", label: "1/4" },
  { value: "1/8", label: "1/8" },
  { value: "1/16", label: "1/16" },
  { value: "1/32", label: "1/32" },
  { value: "1/6", label: "1/6" },
  { value: "1/12", label: "1/12" },
  { value: "1T", label: "Triplet" },
  { value: "dotted", label: "Dotted" },
  { value: "shuffle", label: "Shuffle" },
  { value: "free", label: "Off" },
];

const LANES: { value: ActiveLane; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "velocity", label: "Vel" },
  { value: "cc", label: "CC" },
  { value: "automation", label: "Auto" },
];

type SecondaryToolbarProps = Omit<
  MidiEditorToolbarProps,
  "onToolChange" | "onUndo" | "onRedo" | "onExport"
>;

function SecondaryToolbarControls({
  snapGrid,
  bpm,
  timeSignature,
  drawVelocity,
  isModified,
  hasSelection,
  zoomLevel,
  metronomeEnabled,
  activeLane,
  canSaveToJob,
  isSaving = false,
  onSnapGridChange,
  onBpmChange,
  onTimeSignatureChange,
  onDrawVelocityChange,
  onReset,
  onZoomIn,
  onZoomOut,
  onToggleMetronome,
  onQuantizeSelection,
  onDuplicateSelection,
  onActiveLaneChange,
  onSaveToJob,
  layout = "row",
}: SecondaryToolbarProps & { layout?: "row" | "stack" }) {
  const stack = layout === "stack";

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-xs",
          stack && "w-full justify-between",
        )}
        title="Grid snap"
      >
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

      <div className={cn("flex items-center gap-xs", stack && "w-full justify-between")}>
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
          className="midi-input-num tabular-nums"
          aria-label="BPM"
        />
      </div>

      <div className={cn("flex items-center gap-xs", stack && "w-full justify-between")}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--midi-text-muted)]">
          Time
        </span>
        <select
          value={`${timeSignature.beatsPerBar}/${timeSignature.beatUnit}`}
          onChange={(e) => {
            const [num, den] = e.target.value.split("/").map(Number);
            if (num && den) onTimeSignatureChange({ beatsPerBar: num, beatUnit: den });
          }}
          className="midi-select"
          aria-label="Time signature"
        >
          <option value="2/4">2/4</option>
          <option value="3/4">3/4</option>
          <option value="4/4">4/4</option>
          <option value="5/4">5/4</option>
          <option value="6/8">6/8</option>
          <option value="7/8">7/8</option>
          <option value="9/8">9/8</option>
          <option value="12/8">12/8</option>
        </select>
      </div>

      <MidiPhysicalFader
        label="Draw"
        min={1}
        max={127}
        value={drawVelocity}
        onChange={onDrawVelocityChange}
        ariaLabel="Draw velocity for new notes"
      />

      <div className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
        <MidiPhysicalButton variant="icon" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </MidiPhysicalButton>
        <span className="min-w-[2.5rem] text-center text-[10px] tabular-nums text-muted-foreground">
          {Math.round(zoomLevel * 100)}%
        </span>
        <MidiPhysicalButton variant="icon" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </MidiPhysicalButton>
      </div>

      <MidiPhysicalButton
        variant="icon"
        pressed={metronomeEnabled}
        onClick={onToggleMetronome}
        title="Metronome click track"
        aria-label="Toggle metronome"
        aria-pressed={metronomeEnabled}
      >
        <span className="text-[10px] font-bold">♩</span>
      </MidiPhysicalButton>

      <MidiPhysicalButton
        variant="icon"
        onClick={onQuantizeSelection}
        disabled={!hasSelection}
        title="Quantize selection to grid"
        aria-label="Quantize selection"
      >
        <Magnet className="h-3.5 w-3.5" />
      </MidiPhysicalButton>

      <MidiPhysicalButton
        variant="icon"
        onClick={onDuplicateSelection}
        disabled={!hasSelection}
        title="Duplicate selection (Ctrl+D)"
        aria-label="Duplicate selection"
      >
        <Copy className="h-3.5 w-3.5" />
      </MidiPhysicalButton>

      {/* Lane toggle */}
      <div className="ml-xs inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
        {LANES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onActiveLaneChange(value)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors",
              activeLane === value
                ? "bg-accent-midi/20 text-accent-midi-200"
                : "text-muted-foreground hover:text-secondary-foreground",
            )}
            aria-pressed={activeLane === value}
            aria-label={`Show ${label} lane`}
          >
            {label}
          </button>
        ))}
      </div>

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

      {canSaveToJob && onSaveToJob && (
        <MidiPhysicalButton
          onClick={onSaveToJob}
          disabled={isSaving}
          title="Save edited MIDI to conversion job"
          aria-label="Save to job"
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? "Saving…" : "Save to job"}
        </MidiPhysicalButton>
      )}
    </>
  );
}

export function MidiEditorToolbar(props: MidiEditorToolbarProps) {
  const {
    tool,
    canUndo,
    canRedo,
    onToolChange,
    onUndo,
    onRedo,
    onExport,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-xs">
      <div
        className="midi-toolbar-tool-group inline-flex rounded-md border border-border p-0.5"
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

      <div className="h-5 w-px bg-muted max-md:hidden" aria-hidden />

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

      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-xs">
        <div className="h-5 w-px bg-muted" aria-hidden />
        <SecondaryToolbarControls {...props} layout="row" />
      </div>

      <details className="relative md:hidden">
        <summary
          className="midi-btn midi-btn--icon cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          aria-label="More editor tools"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </summary>
        <div
          className="absolute right-0 top-full z-20 mt-1 flex min-w-[12rem] flex-col gap-sm rounded-md border border-border bg-popover p-sm shadow-elevation-md"
          role="menu"
        >
          <SecondaryToolbarControls {...props} layout="stack" />
        </div>
      </details>

      <div className="flex-1" />

      <MidiPhysicalButton
        variant="play"
        onClick={onExport}
        title="Download edited MIDI file"
        aria-label="Export edited MIDI"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export .mid</span>
      </MidiPhysicalButton>
    </div>
  );
}
