/**
 * MidiEditorCanvas — interactive SVG piano roll with click/drag editing.
 * Supports select, draw, and erase tools with grid snapping.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditableNote, EditorTool, SnapGrid } from "../../hooks/useMidiEditor";
import { midiToNoteName } from "../../utils/musicTheory";
import { cn } from "../../utils/cn";

const LEFT_MARGIN = 48;
const TOP_MARGIN = 4;
const BOTTOM_MARGIN = 24;
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 500;
const NOTE_BORDER_RADIUS = 2;
const RESIZE_HANDLE_WIDTH = 6;

interface MidiEditorCanvasProps {
  notes: EditableNote[];
  selectedIds: Set<string>;
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  gridSizeSeconds: number;
  drawVelocity: number;
  onSelectNote: (noteId: string, additive: boolean) => void;
  onSelectNotes: (noteIds: string[], additive: boolean) => void;
  onDeselectAll: () => void;
  onDeleteNote: (noteId: string) => void;
  onAddNote: (pitch: number, start: number) => void;
  onMoveNotes: (noteIds: string[], deltaPitch: number, deltaTime: number) => void;
  onResizeNote: (noteId: string, newDuration: number) => void;
}

interface NoteRect {
  note: EditableNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function MidiEditorCanvas({
  notes,
  selectedIds,
  tool,
  snapGrid: _snapGrid,
  bpm: _bpm,
  gridSizeSeconds,
  drawVelocity: _drawVelocity,
  onSelectNote,
  onSelectNotes,
  onDeselectAll,
  onDeleteNote,
  onAddNote,
  onMoveNotes,
  onResizeNote,
}: MidiEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [dragState, setDragState] = useState<{
    type: "move" | "resize" | "lasso";
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    noteId?: string;
    originalStart?: number;
    originalDuration?: number;
    originalPitch?: number;
  } | null>(null);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute pitch range and dimensions
  const { minPitch, maxPitch, pitchRange, totalDuration, height } = useMemo(() => {
    if (!notes.length) {
      return { minPitch: 60, maxPitch: 72, pitchRange: 13, totalDuration: 10, height: MIN_HEIGHT };
    }
    const pitches = notes.map((n) => n.pitch);
    const minP = Math.min(...pitches) - 2; // Padding
    const maxP = Math.max(...pitches) + 2;
    const range = maxP - minP + 1;
    const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
    const dur = Math.max(maxEnd * 1.1, 4); // 10% padding + minimum 4s
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, TOP_MARGIN + BOTTOM_MARGIN + range * 12));
    return { minPitch: minP, maxPitch: maxP, pitchRange: range, totalDuration: dur, height: h };
  }, [notes]);

  const drawWidth = containerWidth - LEFT_MARGIN;
  const drawHeight = height - TOP_MARGIN - BOTTOM_MARGIN;

  // Convert between screen coordinates and music coordinates
  const screenToTime = useCallback(
    (x: number) => ((x - LEFT_MARGIN) / drawWidth) * totalDuration,
    [drawWidth, totalDuration],
  );

  const screenToPitch = useCallback(
    (y: number) => {
      const fraction = 1 - (y - TOP_MARGIN) / drawHeight;
      return Math.round(minPitch + fraction * pitchRange);
    },
    [drawHeight, minPitch, pitchRange],
  );

  const timeToScreen = useCallback(
    (time: number) => LEFT_MARGIN + (time / totalDuration) * drawWidth,
    [drawWidth, totalDuration],
  );

  const pitchToScreen = useCallback(
    (pitch: number) =>
      TOP_MARGIN + drawHeight - ((pitch - minPitch + 0.5) / pitchRange) * drawHeight,
    [drawHeight, minPitch, pitchRange],
  );

  // Compute note rectangles
  const noteRects: NoteRect[] = useMemo(() => {
    const noteHeight = Math.max(6, Math.min(16, drawHeight / pitchRange - 1));
    return notes.map((note) => ({
      note,
      x: timeToScreen(note.start),
      y: pitchToScreen(note.pitch) - noteHeight / 2,
      w: Math.max(4, (note.duration / totalDuration) * drawWidth),
      h: noteHeight,
    }));
  }, [notes, timeToScreen, pitchToScreen, drawWidth, totalDuration, drawHeight, pitchRange]);

  // Grid lines
  const gridLines = useMemo(() => {
    if (gridSizeSeconds <= 0) return [];
    const lines: number[] = [];
    for (let t = 0; t <= totalDuration; t += gridSizeSeconds) {
      lines.push(timeToScreen(t));
    }
    return lines;
  }, [gridSizeSeconds, totalDuration, timeToScreen]);

  // Pitch labels
  const pitchLabels = useMemo(() => {
    const labels: { y: number; label: string; isC: boolean }[] = [];
    for (let p = minPitch; p <= maxPitch; p++) {
      if (p % 12 === 0 || pitchRange <= 24) {
        if (pitchRange > 24 && p % 12 !== 0) continue;
        labels.push({
          y: pitchToScreen(p),
          label: midiToNoteName(p),
          isC: p % 12 === 0,
        });
      }
    }
    return labels;
  }, [minPitch, maxPitch, pitchRange, pitchToScreen]);

  // Time labels
  const timeLabels = useMemo(() => {
    const step = totalDuration > 60 ? 15 : totalDuration > 20 ? 5 : totalDuration > 8 ? 2 : 1;
    const labels: { x: number; label: string }[] = [];
    for (let t = 0; t <= totalDuration; t += step) {
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      labels.push({
        x: timeToScreen(t),
        label: mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`,
      });
    }
    return labels;
  }, [totalDuration, timeToScreen]);

  // Hit test: find note at screen position
  const hitTestNote = useCallback(
    (x: number, y: number): { noteRect: NoteRect; isResizeHandle: boolean } | null => {
      // Check in reverse order (top-most first)
      for (let i = noteRects.length - 1; i >= 0; i--) {
        const r = noteRects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          const isResizeHandle = x >= r.x + r.w - RESIZE_HANDLE_WIDTH;
          return { noteRect: r, isResizeHandle };
        }
      }
      return null;
    },
    [noteRects],
  );

  // Pointer handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x < LEFT_MARGIN) return; // Clicked on pitch labels

      if (tool === "erase") {
        const hit = hitTestNote(x, y);
        if (hit) onDeleteNote(hit.noteRect.note.id);
        return;
      }

      if (tool === "draw") {
        const hit = hitTestNote(x, y);
        if (!hit) {
          const pitch = screenToPitch(y);
          const time = screenToTime(x);
          onAddNote(pitch, time);
        }
        return;
      }

      // Select tool
      const hit = hitTestNote(x, y);
      if (hit) {
        const noteId = hit.noteRect.note.id;
        const isSelected = selectedIds.has(noteId);

        if (!isSelected && !e.shiftKey) {
          onSelectNote(noteId, false);
        } else if (!isSelected && e.shiftKey) {
          onSelectNote(noteId, true);
        }

        if (hit.isResizeHandle) {
          setDragState({
            type: "resize",
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            noteId,
            originalDuration: hit.noteRect.note.duration,
          });
        } else {
          setDragState({
            type: "move",
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            noteId,
            originalStart: hit.noteRect.note.start,
            originalPitch: hit.noteRect.note.pitch,
          });
        }

        svg.setPointerCapture(e.pointerId);
      } else {
        // Clicked empty space — start lasso or deselect
        if (!e.shiftKey) onDeselectAll();
        setDragState({
          type: "lasso",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
        });
        svg.setPointerCapture(e.pointerId);
      }
    },
    [tool, hitTestNote, selectedIds, onSelectNote, onDeselectAll, onDeleteNote, onAddNote, screenToPitch, screenToTime],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setDragState((s) => (s ? { ...s, currentX: x, currentY: y } : null));
    },
    [dragState],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = e.currentTarget;
      svg.releasePointerCapture(e.pointerId);

      const dx = dragState.currentX - dragState.startX;
      const dy = dragState.currentY - dragState.startY;

      if (dragState.type === "move" && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        const deltaTime = (dx / drawWidth) * totalDuration;
        const deltaPitch = -Math.round((dy / drawHeight) * pitchRange);
        const ids = selectedIds.has(dragState.noteId!)
          ? Array.from(selectedIds)
          : [dragState.noteId!];
        onMoveNotes(ids, deltaPitch, deltaTime);
      } else if (dragState.type === "move" && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
        // It was a click, not a drag — selection already handled in pointerDown
      } else if (dragState.type === "resize") {
        const deltaTime = (dx / drawWidth) * totalDuration;
        const newDuration = Math.max(0.01, (dragState.originalDuration || 0.1) + deltaTime);
        onResizeNote(dragState.noteId!, newDuration);
      } else if (dragState.type === "lasso") {
        // Select all notes within the lasso rectangle
        const x1 = Math.min(dragState.startX, dragState.currentX);
        const x2 = Math.max(dragState.startX, dragState.currentX);
        const y1 = Math.min(dragState.startY, dragState.currentY);
        const y2 = Math.max(dragState.startY, dragState.currentY);

        if (x2 - x1 > 5 || y2 - y1 > 5) {
          const hitIds = noteRects
            .filter((r) => r.x + r.w > x1 && r.x < x2 && r.y + r.h > y1 && r.y < y2)
            .map((r) => r.note.id);
          if (hitIds.length > 0) {
            onSelectNotes(hitIds, e.shiftKey);
          }
        }
      }

      setDragState(null);
    },
    [dragState, drawWidth, drawHeight, totalDuration, pitchRange, selectedIds, noteRects, onMoveNotes, onResizeNote, onSelectNotes],
  );

  // Cursor style based on tool
  const cursorClass = tool === "draw" ? "cursor-crosshair" : tool === "erase" ? "cursor-pointer" : "cursor-default";

  return (
    <div ref={containerRef} className="w-full rounded-xl border border-violet-500/20 bg-black/50">
      <svg
        width={containerWidth}
        height={height}
        className={cn("block w-full select-none", cursorClass)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="application"
        aria-label={`MIDI note editor with ${notes.length} notes`}
      >
        {/* Background grid lines */}
        {gridLines.map((x, i) => (
          <line
            key={`g-${i}`}
            x1={x}
            x2={x}
            y1={TOP_MARGIN}
            y2={height - BOTTOM_MARGIN}
            stroke="rgba(139,92,246,0.08)"
            strokeWidth={0.5}
          />
        ))}

        {/* Pitch grid lines + labels */}
        {pitchLabels.map((pl, i) => (
          <g key={`pl-${i}`}>
            <line
              x1={LEFT_MARGIN}
              x2={containerWidth}
              y1={pl.y}
              y2={pl.y}
              stroke={pl.isC ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.08)"}
              strokeWidth={pl.isC ? 0.8 : 0.5}
            />
            <text
              x={2}
              y={pl.y + 3}
              fontSize={9}
              fill={pl.isC ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)"}
              fontFamily="monospace"
            >
              {pl.label}
            </text>
          </g>
        ))}

        {/* Time labels */}
        {timeLabels.map((tl, i) => (
          <text
            key={`tl-${i}`}
            x={tl.x}
            y={height - 8}
            fontSize={9}
            fill="rgba(255,255,255,0.35)"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {tl.label}
          </text>
        ))}

        {/* Notes */}
        {noteRects.map((r) => {
          const isSelected = selectedIds.has(r.note.id);
          const opacity = 0.4 + (r.note.velocity / 127) * 0.6;

          return (
            <g key={r.note.id}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={NOTE_BORDER_RADIUS}
                fill={
                  isSelected
                    ? `rgba(251, 191, 36, ${opacity})`
                    : `rgba(167, 139, 250, ${opacity})`
                }
                stroke={isSelected ? "rgba(251, 191, 36, 0.9)" : "rgba(139, 92, 246, 0.5)"}
                strokeWidth={isSelected ? 1.5 : 0.5}
              />
              {/* Resize handle indicator (right edge) */}
              {isSelected && r.w > 12 && (
                <rect
                  x={r.x + r.w - 3}
                  y={r.y + 2}
                  width={2}
                  height={r.h - 4}
                  rx={1}
                  fill="rgba(251, 191, 36, 0.6)"
                  className="cursor-ew-resize"
                />
              )}
            </g>
          );
        })}

        {/* Lasso selection rectangle */}
        {dragState?.type === "lasso" && (
          <rect
            x={Math.min(dragState.startX, dragState.currentX)}
            y={Math.min(dragState.startY, dragState.currentY)}
            width={Math.abs(dragState.currentX - dragState.startX)}
            height={Math.abs(dragState.currentY - dragState.startY)}
            fill="rgba(139, 92, 246, 0.1)"
            stroke="rgba(139, 92, 246, 0.5)"
            strokeWidth={1}
            strokeDasharray="4 2"
            rx={2}
          />
        )}
      </svg>
    </div>
  );
}
