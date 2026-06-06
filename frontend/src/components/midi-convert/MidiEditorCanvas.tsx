import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditableNote, EditorTool, SnapGrid, LoopRegion } from "./editorTypes";
import { midiToNoteName } from "../../utils/musicTheory";
import { snapDuration, snapDeltaTime, snapToGrid, secondsPerBar } from "../../utils/midiEditorSnap";
import { cn } from "../../utils/cn";
import {
  clampEditorZoom,
  isBlackKeyPitch,
  PIANO_ROLL,
  BASE_PIXELS_PER_SECOND,
} from "./pianoRollTheme";
import { useEditorCanvasZoomGestures } from "./useEditorCanvasZoomGestures";
import { MidiTimelineRuler } from "./MidiTimelineRuler";
import { MidiLoopRegionOverlay } from "./MidiLoopRegion";

const LEFT_MARGIN = 48;
const RULER_HEIGHT = 24;
const CONTENT_TOP = RULER_HEIGHT + 2;
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
  playheadTime?: number | null;
  zoomLevel?: number;
  onZoomLevelChange?: (level: number) => void;
  loopRegion?: LoopRegion;
  onSeek?: (time: number) => void;
  onLoopChange?: (region: LoopRegion) => void;
}

interface NoteRect {
  note: EditableNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragState =
  | {
      type: "move";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      noteId: string;
      noteIds: string[];
      originals: { id: string; start: number; pitch: number }[];
    }
  | {
      type: "resize";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      noteId: string;
      originalDuration: number;
    }
  | {
      type: "lasso";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

export function MidiEditorCanvas({
  notes,
  selectedIds,
  tool,
  snapGrid,
  bpm,
  gridSizeSeconds: _gridSizeSeconds,
  drawVelocity: _drawVelocity,
  onSelectNote,
  onSelectNotes,
  onDeselectAll,
  onDeleteNote,
  onAddNote,
  onMoveNotes,
  onResizeNote,
  playheadTime = null,
  zoomLevel = 1,
  onZoomLevelChange,
  loopRegion,
  onSeek,
  onLoopChange,
}: MidiEditorCanvasProps) {
  const pixelsPerSecond =
    BASE_PIXELS_PER_SECOND * clampEditorZoom(zoomLevel);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEditorCanvasZoomGestures(scrollRef, zoomLevel, onZoomLevelChange);
  const [viewportWidth, setViewportWidth] = useState(600);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setViewportWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { minPitch, maxPitch, pitchRange, totalDuration, height } = useMemo(() => {
    if (!notes.length) {
      return { minPitch: 60, maxPitch: 72, pitchRange: 13, totalDuration: 10, height: MIN_HEIGHT };
    }
    const pitches = notes.map((n) => n.pitch);
    const minP = Math.min(...pitches) - 2;
    const maxP = Math.max(...pitches) + 2;
    const range = maxP - minP + 1;
    const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
    const dur = Math.max(maxEnd * 1.1, 4);
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, CONTENT_TOP + BOTTOM_MARGIN + range * 12));
    return { minPitch: minP, maxPitch: maxP, pitchRange: range, totalDuration: dur, height: h };
  }, [notes]);

  const timelineWidth = Math.max(
    viewportWidth - LEFT_MARGIN,
    Math.ceil(totalDuration * pixelsPerSecond),
  );
  const drawHeight = height - CONTENT_TOP - BOTTOM_MARGIN;
  const rowHeight = drawHeight / pitchRange;
  const noteHeight = Math.max(6, Math.min(16, rowHeight - 1));
  const isScrollable = timelineWidth > viewportWidth - LEFT_MARGIN;

  const timeToScreen = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);

  const playheadX = useMemo(() => {
    if (playheadTime == null || playheadTime < 0) return null;
    return timeToScreen(playheadTime);
  }, [playheadTime, timeToScreen]);

  const screenToTime = useCallback((x: number) => x / pixelsPerSecond, [pixelsPerSecond]);

  const screenToPitch = useCallback(
    (y: number) => {
      const fraction = 1 - (y - CONTENT_TOP) / drawHeight;
      return Math.round(minPitch + fraction * pitchRange);
    },
    [drawHeight, minPitch, pitchRange],
  );

  const pitchToScreen = useCallback(
    (pitch: number) =>
      CONTENT_TOP + drawHeight - ((pitch - minPitch + 0.5) / pitchRange) * drawHeight,
    [drawHeight, minPitch, pitchRange],
  );

  const pitchRows = useMemo(() => {
    const rows: { pitch: number; y: number; h: number; isBlack: boolean }[] = [];
    for (let p = minPitch; p <= maxPitch; p++) {
      const centerY = pitchToScreen(p);
      rows.push({
        pitch: p,
        y: centerY - rowHeight / 2,
        h: rowHeight,
        isBlack: isBlackKeyPitch(p),
      });
    }
    return rows;
  }, [minPitch, maxPitch, pitchToScreen, rowHeight]);

  const noteRects: NoteRect[] = useMemo(
    () =>
      notes.map((note) => ({
        note,
        x: timeToScreen(note.start),
        y: pitchToScreen(note.pitch) - noteHeight / 2,
        w: Math.max(4, note.duration * pixelsPerSecond),
        h: noteHeight,
      })),
    [notes, timeToScreen, pitchToScreen, noteHeight, pixelsPerSecond],
  );

  const gridLines = useMemo(() => {
    const barSec = secondsPerBar(bpm);
    const lines: { x: number; isBar: boolean }[] = [];
    const step = _gridSizeSeconds > 0 ? _gridSizeSeconds : barSec;
    for (let t = 0; t <= totalDuration + step * 0.01; t += step) {
      const isBar = Math.abs(t % barSec) < step * 0.25 || t === 0;
      lines.push({ x: timeToScreen(t), isBar });
    }
    return lines;
  }, [_gridSizeSeconds, totalDuration, timeToScreen, bpm]);

  const hitTestNote = useCallback(
    (x: number, y: number): { noteRect: NoteRect; isResizeHandle: boolean } | null => {
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

  const getMoveDelta = useCallback(
    (state: Extract<DragState, { type: "move" }>) => {
      const dx = state.currentX - state.startX;
      const dy = state.currentY - state.startY;
      const deltaTime = snapDeltaTime(dx / pixelsPerSecond, bpm, snapGrid);
      const deltaPitch = -Math.round(dy / rowHeight);
      return { deltaTime, deltaPitch, dx, dy };
    },
    [bpm, snapGrid, rowHeight, pixelsPerSecond],
  );

  const dragPreviewRects = useMemo((): NoteRect[] => {
    if (!dragState) return [];

    if (dragState.type === "move") {
      const { deltaTime, deltaPitch } = getMoveDelta(dragState);
      if (Math.abs(dragState.currentX - dragState.startX) <= 3 &&
          Math.abs(dragState.currentY - dragState.startY) <= 3) {
        return [];
      }
      return dragState.originals.map((orig) => {
        const origNote = notes.find((n) => n.id === orig.id);
        const duration = origNote?.duration ?? 0.25;
        const pitch = Math.max(0, Math.min(127, orig.pitch + deltaPitch));
        const start = Math.max(0, orig.start + deltaTime);
        return {
          note: { id: orig.id, pitch, start, duration, velocity: origNote?.velocity ?? 80 },
          x: timeToScreen(start),
          y: pitchToScreen(pitch) - noteHeight / 2,
          w: Math.max(4, duration * pixelsPerSecond),
          h: noteHeight,
        };
      });
    }

    if (dragState.type === "resize") {
      const dx = dragState.currentX - dragState.startX;
      if (Math.abs(dx) <= 3) return [];
      const rawDuration = Math.max(
        0.01,
        dragState.originalDuration + dx / pixelsPerSecond,
      );
      const duration = snapDuration(rawDuration, bpm, snapGrid);
      const note = notes.find((n) => n.id === dragState.noteId);
      if (!note) return [];
      return [
        {
          note: { ...note, duration },
          x: timeToScreen(note.start),
          y: pitchToScreen(note.pitch) - noteHeight / 2,
          w: Math.max(4, duration * pixelsPerSecond),
          h: noteHeight,
        },
      ];
    }

    return [];
  }, [dragState, getMoveDelta, notes, timeToScreen, pitchToScreen, noteHeight, bpm, snapGrid, pixelsPerSecond]);

  const draggingNoteIds = useMemo(() => {
    if (!dragState) return new Set<string>();
    if (dragState.type === "move") return new Set(dragState.noteIds);
    if (dragState.type === "resize") return new Set([dragState.noteId]);
    return new Set<string>();
  }, [dragState]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (tool === "erase") {
        const hit = hitTestNote(x, y);
        if (hit) onDeleteNote(hit.noteRect.note.id);
        return;
      }

      if (tool === "draw") {
        const hit = hitTestNote(x, y);
        if (!hit) {
          const pitch = screenToPitch(y);
          const time = snapToGrid(screenToTime(x), bpm, snapGrid);
          onAddNote(pitch, time);
        }
        return;
      }

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
          const noteIds = selectedIds.has(noteId)
            ? Array.from(selectedIds)
            : [noteId];
          const originals = notes
            .filter((n) => noteIds.includes(n.id))
            .map((n) => ({ id: n.id, start: n.start, pitch: n.pitch }));
          setDragState({
            type: "move",
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            noteId,
            noteIds,
            originals,
          });
        }

        svg.setPointerCapture(e.pointerId);
      } else {
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
    [
      tool,
      hitTestNote,
      selectedIds,
      notes,
      onSelectNote,
      onDeselectAll,
      onDeleteNote,
      onAddNote,
      screenToPitch,
      screenToTime,
      bpm,
      snapGrid,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setDragState((s) => (s ? { ...s, currentX: x, currentY: y } : null));
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = e.currentTarget;
      svg.releasePointerCapture(e.pointerId);

      if (dragState.type === "move") {
        const { deltaTime, deltaPitch, dx, dy } = getMoveDelta(dragState);
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          onMoveNotes(dragState.noteIds, deltaPitch, deltaTime);
        }
      } else if (dragState.type === "resize") {
        const dx = dragState.currentX - dragState.startX;
        if (Math.abs(dx) > 3) {
          const rawDuration = Math.max(
            0.01,
            dragState.originalDuration + dx / pixelsPerSecond,
          );
          const newDuration = snapDuration(rawDuration, bpm, snapGrid);
          onResizeNote(dragState.noteId, newDuration);
        }
      } else if (dragState.type === "lasso") {
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
    [
      dragState,
      getMoveDelta,
      noteRects,
      onMoveNotes,
      onResizeNote,
      onSelectNotes,
      bpm,
      snapGrid,
      pixelsPerSecond,
    ],
  );

  const cursorClass =
    tool === "draw" || tool === "erase" ? "cursor-crosshair" : "cursor-default";

  const renderNoteRect = (
    r: NoteRect,
    opts: { isSelected: boolean; isPreview?: boolean; isGhost?: boolean },
  ) => {
    const { isSelected, isPreview = false, isGhost = false } = opts;

    let fill: string;
    let stroke: string;
    if (isPreview) {
      fill = PIANO_ROLL.notePreviewFill;
      stroke = PIANO_ROLL.notePreviewStroke;
    } else if (isSelected) {
      fill = PIANO_ROLL.noteSelectedFill(r.note.velocity);
      stroke = PIANO_ROLL.noteSelectedStroke;
    } else {
      fill = PIANO_ROLL.noteFill(r.note.velocity);
      stroke = PIANO_ROLL.noteStroke;
    }

    return (
      <g key={isPreview ? `preview-${r.note.id}` : r.note.id} pointerEvents="none">
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={NOTE_BORDER_RADIUS}
          fill={fill}
          stroke={stroke}
          strokeWidth={isPreview ? 1.5 : isSelected ? 1.5 : 0.5}
          strokeDasharray={isPreview ? "4 3" : undefined}
          opacity={isGhost ? 0.35 : 1}
        />
        {isSelected && !isPreview && !isGhost && r.w > 12 && (
          <rect
            x={r.x + r.w - 3}
            y={r.y + 2}
            width={2}
            height={r.h - 4}
            rx={1}
            fill="rgba(251, 191, 36, 0.6)"
          />
        )}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-border"
      style={{ backgroundColor: PIANO_ROLL.surface }}
    >
      {/* Timeline ruler with seek and loop */}
      <MidiTimelineRuler
        totalDuration={totalDuration}
        pixelsPerSecond={pixelsPerSecond}
        timelineWidth={timelineWidth}
        loopRegion={loopRegion ?? { enabled: false, start: 0, end: 4 }}
        onSeek={(time) => onSeek?.(time)}
        onLoopChange={(region) => onLoopChange?.(region)}
        onZoomLevelChange={onZoomLevelChange}
      />

      <div className="flex">
        {/* Piano keyboard gutter (fixed) */}
        <svg
          width={LEFT_MARGIN}
          height={height}
          className="shrink-0 select-none"
          style={{ backgroundColor: PIANO_ROLL.ruler }}
          aria-hidden
        >
          <rect x={0} y={0} width={LEFT_MARGIN} height={RULER_HEIGHT} fill={PIANO_ROLL.ruler} />
          {pitchRows.map((row) => {
            const keyW = row.isBlack
              ? LEFT_MARGIN * PIANO_ROLL.gutterBlackKeyWidthRatio
              : LEFT_MARGIN - 2;
            return (
              <g key={`key-${row.pitch}`}>
                <rect
                  x={row.isBlack ? 0 : 1}
                  y={row.y}
                  width={keyW}
                  height={row.h}
                  fill={row.isBlack ? PIANO_ROLL.gutterBlackKey : PIANO_ROLL.gutterWhiteKey}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={0.5}
                />
                {(row.pitch % 12 === 0 || pitchRange <= 24) && (
                  <text
                    x={row.isBlack ? 4 : 6}
                    y={row.y + row.h * 0.65}
                    fontSize={8}
                    fill={row.isBlack ? PIANO_ROLL.labelOnBlack : PIANO_ROLL.labelOnWhite}
                    fontFamily="monospace"
                  >
                    {midiToNoteName(row.pitch)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Scrollable timeline */}
        <div
          ref={scrollRef}
          className={cn(
            "min-w-0 flex-1",
            isScrollable && "overflow-x-auto overflow-y-hidden",
          )}
          title={
            isScrollable
              ? "Scroll horizontally · pinch or Ctrl+wheel to zoom"
              : onZoomLevelChange
                ? "Pinch or Ctrl+wheel to zoom timeline"
                : undefined
          }
          style={{ touchAction: onZoomLevelChange ? "pan-x" : undefined }}
        >
          <svg
            width={timelineWidth}
            height={height}
            className={cn("block select-none", cursorClass)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            role="application"
            aria-label={`MIDI note editor with ${notes.length} notes${isScrollable ? ", scroll horizontally for full timeline" : ""}`}
          >
            {/* Row stripes (black / white keys) */}
            {pitchRows.map((row) => (
              <rect
                key={`row-bg-${row.pitch}`}
                x={0}
                y={row.y}
                width={timelineWidth}
                height={row.h}
                fill={row.isBlack ? PIANO_ROLL.blackKeyRow : PIANO_ROLL.whiteKeyRow}
              />
            ))}

            {gridLines.map((line, i) => (
              <line
                key={`g-${i}`}
                x1={line.x}
                x2={line.x}
                y1={CONTENT_TOP}
                y2={height - BOTTOM_MARGIN}
                stroke={line.isBar ? PIANO_ROLL.gridBar : PIANO_ROLL.gridBeat}
                strokeWidth={line.isBar ? 1 : 0.5}
              />
            ))}

            {pitchRows.map((row) =>
              row.pitch % 12 === 0 ? (
                <line
                  key={`c-line-${row.pitch}`}
                  x1={0}
                  x2={timelineWidth}
                  y1={row.y + row.h}
                  y2={row.y + row.h}
                  stroke={PIANO_ROLL.rowLineC}
                  strokeWidth={0.5}
                />
              ) : (
                <line
                  key={`row-line-${row.pitch}`}
                  x1={0}
                  x2={timelineWidth}
                  y1={row.y + row.h}
                  y2={row.y + row.h}
                  stroke={PIANO_ROLL.rowLine}
                  strokeWidth={0.5}
                />
              ),
            )}

            {/* Loop region overlay */}
            {loopRegion && (
              <MidiLoopRegionOverlay
                loopRegion={loopRegion}
                pixelsPerSecond={pixelsPerSecond}
                contentTop={CONTENT_TOP}
                contentHeight={height - CONTENT_TOP - BOTTOM_MARGIN}
                timelineWidth={timelineWidth}
              />
            )}

            {noteRects.map((r) => {
              const isSelected = selectedIds.has(r.note.id);
              const isGhost = draggingNoteIds.has(r.note.id);
              return renderNoteRect(r, { isSelected, isGhost });
            })}

            {dragPreviewRects.map((r) =>
              renderNoteRect(r, { isSelected: true, isPreview: true }),
            )}

            {dragState?.type === "lasso" && (
              <rect
                x={Math.min(dragState.startX, dragState.currentX)}
                y={Math.min(dragState.startY, dragState.currentY)}
                width={Math.abs(dragState.currentX - dragState.startX)}
                height={Math.abs(dragState.currentY - dragState.startY)}
                fill={PIANO_ROLL.lassoFill}
                stroke={PIANO_ROLL.lassoStroke}
                strokeWidth={1}
                strokeDasharray="4 2"
                rx={2}
              />
            )}

            {playheadX != null && (
              <line
                x1={playheadX}
                x2={playheadX}
                y1={CONTENT_TOP}
                y2={height - BOTTOM_MARGIN}
                stroke={PIANO_ROLL.playhead}
                strokeWidth={1.5}
                strokeLinecap="round"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>
      </div>

      {isScrollable && (
        <p
          className="border-t border-border px-sm py-1.5 text-[10px] text-muted-foreground"
          style={{ backgroundColor: PIANO_ROLL.ruler }}
        >
          Scroll timeline horizontally · {Math.round(totalDuration)}s
        </p>
      )}
    </div>
  );
}
