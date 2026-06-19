/**
 * MidiControlBar — single-row consolidated control bar merging transport + toolbar.
 * Frequently-used tools are always visible; secondary items tuck behind [...] overflow.
 */
import {
  Circle,
  Copy,
  Download,
  Eraser,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Pencil,
  Play,

  RotateCcw,
  Save,
  Scissors,
  Square,
  Redo2,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";
import type { EditorTool, SnapGrid, TimeSignature } from "./editorTypes";
import { EDITOR_TOOLS } from "./pianoRollTheme";

function formatControlBarTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `0:${secs.toString().padStart(2, "0")}`;
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

export interface MidiControlBarProps {
  // Transport
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  loopEnabled: boolean;
  isSupported: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleLoop: () => void;

  // Editor tools
  tool: EditorTool;
  snapGrid: SnapGrid;
  canUndo: boolean;
  canRedo: boolean;
  isModified: boolean;
  hasSelection: boolean;
  zoomLevel: number;
  verticalZoomLevel: number;
  metronomeEnabled: boolean;
  onToolChange: (tool: EditorTool) => void;
  onSnapGridChange: (grid: SnapGrid) => void;
  onBpmChange: (bpm: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomLevelChange: (level: number) => void;
  onVerticalZoomLevelChange: (level: number) => void;
  onToggleMetronome: () => void;

  // Overflow items
  timeSignature: TimeSignature;
  drawVelocity: number;
  canSaveToJob: boolean;
  isSaving?: boolean;
  midiRecordSupported?: boolean;
  midiRecordEnabled?: boolean;
  onTimeSignatureChange: (ts: TimeSignature) => void;
  onDrawVelocityChange: (vel: number) => void;
  onQuantizeSelection: () => void;
  onDuplicateSelection: () => void;
  onToggleMidiRecord?: () => void;
  onSaveToJob?: () => void;

  // Shortcuts
  showShortcuts: boolean;
  onToggleShortcuts: () => void;

  // Process MIDI dialog trigger
  onOpenProcessDialog?: () => void;
}

export function MidiControlBar(props: MidiControlBarProps) {
  const {
    isPlaying,
    isPaused,
    currentTime,
    duration,
    bpm,
    loopEnabled,
    isSupported,
    onPlay,
    onPause,
    onStop,
    onToggleLoop,
    tool,
    snapGrid,
    canUndo,
    canRedo,
    isModified,
    hasSelection,
    zoomLevel,
    verticalZoomLevel,
    metronomeEnabled,
    onToolChange,
    onSnapGridChange,
    onBpmChange,
    onUndo,
    onRedo,
    onExport,
    onReset,
    onZoomIn,
    onZoomOut,
    onZoomLevelChange,
    onVerticalZoomLevelChange,
    onToggleMetronome,
    timeSignature,
    drawVelocity,
    canSaveToJob,
    isSaving = false,
    midiRecordSupported = false,
    midiRecordEnabled = false,
    onTimeSignatureChange,
    onDrawVelocityChange,
    onQuantizeSelection,
    onDuplicateSelection,
    onToggleMidiRecord,
    onSaveToJob,
    onOpenProcessDialog,
    showShortcuts,
    onToggleShortcuts,
  } = props;

  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpen]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [overflowOpen]);

  const handlePlayPause = useCallback(() => {
    if (isPaused) onPlay();
    else if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, isPaused, onPlay, onPause]);

  return (
    <div className="midi-control-bar" role="toolbar" aria-label="Editor controls">
      {/* ─── Transport ─── */}
      <div className="midi-control-bar__group" role="group" aria-label="Transport">
        <MidiPhysicalButton
          variant="play"
          onClick={handlePlayPause}
          disabled={!isSupported}
          title={isPaused ? "Resume (Space)" : isPlaying ? "Pause (Space)" : "Play (Space)"}
          aria-label={isPaused ? "Resume" : isPlaying ? "Pause" : "Play"}
        >
          {isPaused ? (
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
          ) : isPlaying ? (
            <Pause className="h-3.5 w-3.5 fill-current" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
          )}
        </MidiPhysicalButton>

        <MidiPhysicalButton
          variant="icon"
          onClick={onStop}
          disabled={!isSupported}
          title="Stop"
          aria-label="Stop"
        >
          <Square className="h-3 w-3 fill-current" aria-hidden />
        </MidiPhysicalButton>

        <span className="midi-control-bar__time tabular-nums" aria-live="polite" aria-label="Playhead position">
          {formatControlBarTime(currentTime)}
          <span className="opacity-40"> / </span>
          {formatControlBarTime(duration)}
        </span>

        <MidiPhysicalButton
          variant="icon"
          pressed={loopEnabled}
          onClick={onToggleLoop}
          disabled={!isSupported}
          title={loopEnabled ? "Disable loop" : "Enable loop region"}
          aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
          aria-pressed={loopEnabled}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
        </MidiPhysicalButton>

        {midiRecordSupported && onToggleMidiRecord && (
          <MidiPhysicalButton
            variant="icon"
            pressed={midiRecordEnabled}
            onClick={onToggleMidiRecord}
            disabled={!isSupported}
            title={midiRecordEnabled ? "Stop MIDI record" : "Record MIDI notes"}
            aria-label={midiRecordEnabled ? "Stop recording" : "Record MIDI"}
            aria-pressed={midiRecordEnabled}
            className={midiRecordEnabled ? "midi-btn--recording" : "midi-btn--record"}
          >
            <Circle className="h-3 w-3 fill-current" aria-hidden />
          </MidiPhysicalButton>
        )}
      </div>

      <div className="midi-control-bar__divider" aria-hidden />

      {/* ─── Tools ─── */}
      <div className="midi-control-bar__group" role="group" aria-label="Editor tools">
        <div className="midi-control-bar__tool-group">
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
                className="midi-control-bar__tool-btn"
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
              </MidiPhysicalButton>
            );
          })}
        </div>

        <MidiPhysicalButton
          variant="icon"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 className="h-3 w-3" />
        </MidiPhysicalButton>
        <MidiPhysicalButton
          variant="icon"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 className="h-3 w-3" />
        </MidiPhysicalButton>

        {tool === "draw" && (
          <span className="midi-draw-velocity" title="Note velocity">
            <Pencil className="h-2.5 w-2.5 text-[var(--midi-accent)]" aria-hidden />
            <span className="tabular-nums">{drawVelocity}</span>
          </span>
        )}
      </div>

      <div className="midi-control-bar__divider" aria-hidden />

      {/* ─── Grid snap & Quantize ─── */}
      <div className="midi-control-bar__group" title="Grid snap">
        <Magnet
          className={cn(
            "h-3 w-3 shrink-0",
            snapGrid === "free" ? "text-muted-foreground" : "text-success-400/90",
          )}
          aria-hidden
        />
        <select
          value={snapGrid}
          onChange={(e) => onSnapGridChange(e.target.value as SnapGrid)}
          className="midi-control-bar__select"
          aria-label="Snap to grid"
        >
          {GRIDS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <MidiPhysicalButton
          variant="icon"
          onClick={() => { onQuantizeSelection(); }}
          disabled={!hasSelection}
          title="Quantize selected notes (Q)"
          aria-label="Quantize"
        >
          <Magnet className="h-3 w-3" aria-hidden />
        </MidiPhysicalButton>
      </div>

      <div className="midi-control-bar__divider" aria-hidden />

      {/* ─── BPM & Time Signature ─── */}
      <div className="midi-control-bar__group">
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) onBpmChange(val);
          }}
          className="midi-control-bar__num tabular-nums"
          aria-label="BPM"
          title="Tempo (BPM)"
        />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--midi-text-muted)]">
          BPM
        </span>
        <span className="mx-0.5 text-[9px] text-[var(--midi-text-muted)] opacity-40">|</span>
        <select
          value={`${timeSignature.beatsPerBar}/${timeSignature.beatUnit}`}
          onChange={(e) => {
            const [num, den] = e.target.value.split("/").map(Number);
            if (num && den) onTimeSignatureChange({ beatsPerBar: num, beatUnit: den });
          }}
          className="midi-control-bar__select"
          aria-label="Time signature"
          title="Time signature"
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

      <div className="midi-control-bar__divider" aria-hidden />

      {/* ─── Zoom ─── */}
      <div className="midi-control-bar__group">
        <MidiPhysicalButton
          variant="icon"
          onClick={onZoomOut}
          title="Zoom out horizontally (Ctrl+Wheel)"
          aria-label="Zoom out horizontally"
        >
          <ZoomOut className="h-3 w-3" />
        </MidiPhysicalButton>
        <span className="min-w-[2.2rem] text-center text-[10px] tabular-nums text-muted-foreground">
          {Math.round(zoomLevel * 100)}%
        </span>
        <MidiPhysicalButton
          variant="icon"
          onClick={onZoomIn}
          title="Zoom in horizontally (Ctrl+Wheel)"
          aria-label="Zoom in horizontally"
        >
          <ZoomIn className="h-3 w-3" />
        </MidiPhysicalButton>
      </div>

      <div className="midi-control-bar__divider" aria-hidden />

      {/* ─── Secondary visible controls ─── */}
      <div className="midi-control-bar__group">
        <MidiPhysicalButton
          variant="icon"
          pressed={metronomeEnabled}
          onClick={onToggleMetronome}
          title="Metronome click track"
          aria-label="Toggle metronome"
          aria-pressed={metronomeEnabled}
          className="midi-physical-btn--metronome"
        >
          <span className="text-[10px] font-bold leading-none">♩</span>
        </MidiPhysicalButton>

        <MidiPhysicalButton
          variant="icon"
          onClick={onToggleShortcuts}
          pressed={showShortcuts}
          title={showShortcuts ? "Hide keyboard shortcuts" : "Show keyboard shortcuts"}
          aria-label={showShortcuts ? "Hide shortcuts" : "Show shortcuts"}
          aria-pressed={showShortcuts}
          className="midi-physical-btn--shortcuts"
        >
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-current text-[8px] font-bold leading-none">
            ?
          </span>
        </MidiPhysicalButton>

        {/* Overflow menu */}
        <div ref={overflowRef} className="relative">
          <MidiPhysicalButton
            variant="icon"
            onClick={() => setOverflowOpen((v) => !v)}
            pressed={overflowOpen}
            title="More tools"
            aria-label="More tools"
            aria-haspopup="true"
            aria-expanded={overflowOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </MidiPhysicalButton>

          {overflowOpen && (
            <div className="midi-control-bar__overflow midi-overflow-enter" role="menu">
              {/* Draw velocity */}
              <div className="midi-control-bar__overflow-row">
                <span className="midi-control-bar__overflow-label">Velocity</span>
                <input
                  type="range"
                  min={1}
                  max={127}
                  value={drawVelocity}
                  onChange={(e) => onDrawVelocityChange(parseInt(e.target.value, 10))}
                  className="midi-control-bar__overflow-slider"
                  aria-label="Draw velocity"
                />
                <span className="min-w-[2rem] text-right font-mono text-[10px] text-muted-foreground">
                  {drawVelocity}
                </span>
              </div>

              {/* H zoom slider */}
              <div className="midi-control-bar__overflow-row">
                <span className="midi-control-bar__overflow-label">H-Zoom</span>
                <input
                  type="range"
                  min={50}
                  max={300}
                  step={5}
                  value={Math.round(zoomLevel * 100)}
                  onChange={(e) => onZoomLevelChange(Number(e.target.value) / 100)}
                  className="midi-control-bar__overflow-slider"
                  aria-label="Horizontal zoom"
                />
                <span className="min-w-[2rem] text-right font-mono text-[10px] text-muted-foreground">
                  {Math.round(zoomLevel * 100)}%
                </span>
              </div>

              {/* V zoom slider */}
              <div className="midi-control-bar__overflow-row">
                <span className="midi-control-bar__overflow-label">V-Zoom</span>
                <input
                  type="range"
                  min={75}
                  max={225}
                  step={5}
                  value={Math.round(verticalZoomLevel * 100)}
                  onChange={(e) => onVerticalZoomLevelChange(Number(e.target.value) / 100)}
                  className="midi-control-bar__overflow-slider"
                  aria-label="Vertical zoom"
                />
                <span className="min-w-[2rem] text-right font-mono text-[10px] text-muted-foreground">
                  {Math.round(verticalZoomLevel * 100)}%
                </span>
              </div>

              <div className="midi-control-bar__overflow-divider" />

              {/* Duplicate */}
              <button
                type="button"
                onClick={() => { onDuplicateSelection(); setOverflowOpen(false); }}
                disabled={!hasSelection}
                className="midi-control-bar__overflow-btn"
                role="menuitem"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>

              {/* Process MIDI */}
              {onOpenProcessDialog && (
                <button
                  type="button"
                  onClick={() => { onOpenProcessDialog(); setOverflowOpen(false); }}
                  className="midi-control-bar__overflow-btn"
                  role="menuitem"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Process MIDI
                </button>
              )}

              {/* Revert (only when modified) */}
              {isModified && (
                <button
                  type="button"
                  onClick={() => { onReset(); setOverflowOpen(false); }}
                  className="midi-control-bar__overflow-btn"
                  role="menuitem"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Revert edits
                </button>
              )}

              {/* Save to job (only when available) */}
              {canSaveToJob && onSaveToJob && (
                <button
                  type="button"
                  onClick={() => { onSaveToJob(); setOverflowOpen(false); }}
                  disabled={isSaving}
                  className="midi-control-bar__overflow-btn"
                  role="menuitem"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "Saving…" : "Save to job"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-[4px]" />

      {/* ─── Export ─── */}
      <MidiPhysicalButton
        variant="play"
        onClick={onExport}
        title="Download edited MIDI file"
        aria-label="Export edited MIDI"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-[11px]">Export</span>
      </MidiPhysicalButton>
    </div>
  );
}
