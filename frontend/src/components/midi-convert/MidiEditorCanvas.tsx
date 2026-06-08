import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EditableNote,
  EditorTool,
  LoopRegion,
  SnapGrid,
  TimeSignature,
} from "./editorTypes";
import { DEFAULT_TIME_SIG } from "./editorTypes";
import type { RootNote, Scale } from "../../utils/musicTheory";
import { isMidiInScale, midiToNoteName } from "../../utils/musicTheory";
import {
  snapDeltaTime,
  snapToGrid,
  secondsPerBar,
} from "../../utils/midiEditorSnap";
import { cn } from "../../utils/cn";
import {
  BASE_PIXELS_PER_SECOND,
  clampEditorVerticalZoom,
  clampEditorZoom,
  isBlackKeyPitch,
  PIANO_ROLL,
} from "./pianoRollTheme";
import { useEditorCanvasZoomGestures } from "./useEditorCanvasZoomGestures";
import { MidiTimelineRuler } from "./MidiTimelineRuler";
import { MidiLoopRegionOverlay } from "./MidiLoopRegion";
import {
  CANVAS_NOTE_THRESHOLD,
  MidiNoteCanvasLayer,
} from "./MidiNoteCanvasLayer";
import { MidiContextMenu } from "./MidiContextMenu";

const LEFT_MARGIN = 56;
const RULER_HEIGHT = 28;
const CONTENT_TOP = RULER_HEIGHT + 2;
const BOTTOM_MARGIN = 24;
const MIN_HEIGHT = 340;
const MAX_HEIGHT = 880;
const NOTE_BORDER_RADIUS = 4;
const RESIZE_HANDLE_WIDTH = 8;

interface MidiEditorCanvasProps {
  notes: EditableNote[];
  selectedIds: Set<string>;
  tool: EditorTool;
  snapGrid: SnapGrid;
  bpm: number;
  timeSignature?: TimeSignature;
  gridSizeSeconds: number;
  drawVelocity: number;
  onSelectNote: (noteId: string, additive: boolean) => void;
  onSelectNotes: (noteIds: string[], additive: boolean) => void;
  onDeselectAll: () => void;
  onDeleteNote: (noteId: string) => void;
  onAddNote: (pitch: number, start: number) => void;
  onMoveNotes: (
    noteIds: string[],
    deltaPitch: number,
    deltaTime: number,
  ) => void;
  onDuplicateNotes: (
    noteIds: string[],
    deltaPitch: number,
    deltaTime: number,
  ) => void;
  onResizeNote: (noteId: string, newStart: number, newDuration: number) => void;
  onSplitNote?: (noteId: string, time: number) => void;
  onToggleMuteNote: (noteId: string, muted: boolean) => void;
  onSetNoteChannel: (noteId: string, channel: number) => void;
  onQuantizeSelection: () => void;
  onQuantizeNotes: (noteIds: string[]) => void;
  onHumanizeSelection: () => void;
  onLegatoSelection: () => void;
  onAuditionNotes?: (notes: EditableNote[]) => void;
  e2eMode?: boolean;
  playheadTime?: number | null;
  zoomLevel?: number;
  verticalZoomLevel?: number;
  scaleGuide?: { root: RootNote; scale: Scale; locked: boolean };
  onZoomLevelChange?: (level: number) => void;
  onVerticalZoomLevelChange?: (level: number) => void;
  loopRegion?: LoopRegion;
  onSeek?: (time: number) => void;
  onLoopChange?: (region: LoopRegion) => void;
  timelineScrollRef?: React.RefObject<HTMLDivElement | null>;
  onTimelineScroll?: (scrollLeft: number) => void;
}

interface NoteRect {
  note: EditableNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResizeEdge = "left" | "right" | null;

type DragState =
  | {
      type: "move";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      noteId: string;
      noteIds: string[];
      originals: {
        id: string;
        start: number;
        pitch: number;
        duration: number;
      }[];
      duplicateOnDrop: boolean;
    }
  | {
      type: "resize";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      noteId: string;
      edge: Exclude<ResizeEdge, null>;
      originalStart: number;
      originalDuration: number;
      originalEnd: number;
    }
  | {
      type: "lasso";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  noteId: string | null;
}

export function MidiEditorCanvas({
  notes,
  selectedIds,
  tool,
  snapGrid,
  bpm,
  timeSignature = DEFAULT_TIME_SIG,
  gridSizeSeconds,
  drawVelocity: _drawVelocity,
  onSelectNote,
  onSelectNotes,
  onDeselectAll,
  onDeleteNote,
  onAddNote,
  onMoveNotes,
  onDuplicateNotes,
  onResizeNote,
  onSplitNote,
  onToggleMuteNote,
  onSetNoteChannel,
  onQuantizeSelection,
  onQuantizeNotes,
  onHumanizeSelection,
  onLegatoSelection,
  onAuditionNotes,
  e2eMode = false,
  playheadTime = null,
  zoomLevel = 1,
  verticalZoomLevel = 1,
  scaleGuide,
  onZoomLevelChange,
  onVerticalZoomLevelChange,
  loopRegion,
  onSeek,
  onLoopChange,
  timelineScrollRef,
  onTimelineScroll,
}: MidiEditorCanvasProps) {
  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * clampEditorZoom(zoomLevel);
  const verticalZoom = clampEditorVerticalZoom(verticalZoomLevel);
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = timelineScrollRef ?? internalScrollRef;
  useEditorCanvasZoomGestures(
    scrollRef,
    zoomLevel,
    onZoomLevelChange,
    verticalZoomLevel,
    onVerticalZoomLevelChange,
  );

  const [viewportWidth, setViewportWidth] = useState(700);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<ResizeEdge>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    noteId: null,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setViewportWidth(width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { minPitch, maxPitch, pitchRange, totalDuration, height } =
    useMemo(() => {
      if (!notes.length) {
        const emptyRowHeight = 14 * verticalZoom;
        return {
          minPitch: 48,
          maxPitch: 72,
          pitchRange: 25,
          totalDuration: 8,
          height: Math.max(
            MIN_HEIGHT,
            CONTENT_TOP + BOTTOM_MARGIN + 25 * emptyRowHeight,
          ),
        };
      }

      const pitches = notes.map((n) => n.pitch);
      const minP = Math.max(0, Math.min(...pitches) - 3);
      const maxP = Math.min(127, Math.max(...pitches) + 3);
      const range = maxP - minP + 1;
      const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
      const rowPx = Math.max(10, Math.min(28, 12 * verticalZoom));
      const canvasHeight = Math.max(
        MIN_HEIGHT,
        Math.min(MAX_HEIGHT, CONTENT_TOP + BOTTOM_MARGIN + range * rowPx),
      );

      return {
        minPitch: minP,
        maxPitch: maxP,
        pitchRange: range,
        totalDuration: Math.max(maxEnd * 1.1, 4),
        height: canvasHeight,
      };
    }, [notes, verticalZoom]);

  const timelineWidth = Math.max(
    viewportWidth - LEFT_MARGIN,
    Math.ceil(totalDuration * pixelsPerSecond),
  );
  const drawHeight = height - CONTENT_TOP - BOTTOM_MARGIN;
  const effectiveRowHeight = Math.max(10, drawHeight / pitchRange);
  const noteHeight = Math.max(8, Math.min(22, effectiveRowHeight - 1.5));
  const isScrollable = timelineWidth > viewportWidth - LEFT_MARGIN;
  const beatSeconds = 60 / bpm;

  const timeToScreen = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond],
  );
  const screenToTime = useCallback(
    (x: number) => x / pixelsPerSecond,
    [pixelsPerSecond],
  );

  const pitchToScreen = useCallback(
    (pitch: number) =>
      CONTENT_TOP +
      drawHeight -
      ((pitch - minPitch + 0.5) / pitchRange) * drawHeight,
    [drawHeight, minPitch, pitchRange],
  );

  const screenToPitch = useCallback(
    (y: number) => {
      const fraction = 1 - (y - CONTENT_TOP) / drawHeight;
      return Math.max(
        0,
        Math.min(127, Math.round(minPitch + fraction * pitchRange)),
      );
    },
    [drawHeight, minPitch, pitchRange],
  );

  const playheadX = useMemo(() => {
    if (playheadTime == null || playheadTime < 0) return null;
    return timeToScreen(playheadTime);
  }, [playheadTime, timeToScreen]);

  const pitchRows = useMemo(() => {
    const rows: Array<{
      pitch: number;
      y: number;
      h: number;
      isBlack: boolean;
      inScale: boolean;
    }> = [];

    for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
      const centerY = pitchToScreen(pitch);
      const inScale = scaleGuide
        ? isMidiInScale(pitch, scaleGuide.root, scaleGuide.scale)
        : true;
      rows.push({
        pitch,
        y: centerY - effectiveRowHeight / 2,
        h: effectiveRowHeight,
        isBlack: isBlackKeyPitch(pitch),
        inScale,
      });
    }

    return rows;
  }, [minPitch, maxPitch, pitchToScreen, effectiveRowHeight, scaleGuide]);

  const noteRects: NoteRect[] = useMemo(
    () =>
      notes.map((note) => ({
        note,
        x: timeToScreen(note.start),
        y: pitchToScreen(note.pitch) - noteHeight / 2,
        w: Math.max(6, note.duration * pixelsPerSecond),
        h: noteHeight,
      })),
    [notes, timeToScreen, pitchToScreen, noteHeight, pixelsPerSecond],
  );

  const gridLines = useMemo(() => {
    const lines: Array<{ x: number; level: "subdivision" | "beat" | "bar" }> =
      [];
    const barSec = secondsPerBar(bpm, timeSignature);
    const subdivisionStep =
      snapGrid === "free" ? beatSeconds / 2 : Math.max(gridSizeSeconds, 0.01);

    for (
      let t = 0;
      t <= totalDuration + subdivisionStep * 0.01;
      t += subdivisionStep
    ) {
      const isBar = Math.abs(t % barSec) < subdivisionStep * 0.25 || t === 0;
      const isBeat =
        !isBar && Math.abs(t % beatSeconds) < subdivisionStep * 0.25;
      lines.push({
        x: timeToScreen(t),
        level: isBar ? "bar" : isBeat ? "beat" : "subdivision",
      });
    }

    return lines;
  }, [
    bpm,
    beatSeconds,
    gridSizeSeconds,
    snapGrid,
    timeSignature,
    timeToScreen,
    totalDuration,
  ]);

  const hitTestNote = useCallback(
    (
      x: number,
      y: number,
    ): { noteRect: NoteRect; resizeEdge: ResizeEdge } | null => {
      for (let index = noteRects.length - 1; index >= 0; index -= 1) {
        const rect = noteRects[index];
        if (
          x >= rect.x &&
          x <= rect.x + rect.w &&
          y >= rect.y &&
          y <= rect.y + rect.h
        ) {
          const nearLeft = rect.w > 10 && x <= rect.x + RESIZE_HANDLE_WIDTH;
          const nearRight =
            rect.w > 10 && x >= rect.x + rect.w - RESIZE_HANDLE_WIDTH;
          return {
            noteRect: rect,
            resizeEdge: nearLeft ? "left" : nearRight ? "right" : null,
          };
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
      return {
        dx,
        dy,
        deltaTime: snapDeltaTime(
          dx / pixelsPerSecond,
          bpm,
          snapGrid,
          timeSignature,
        ),
        deltaPitch: -Math.round(dy / effectiveRowHeight),
      };
    },
    [pixelsPerSecond, bpm, snapGrid, timeSignature, effectiveRowHeight],
  );

  const dragPreviewRects = useMemo((): NoteRect[] => {
    if (!dragState) return [];

    if (dragState.type === "move") {
      const { dx, dy, deltaTime, deltaPitch } = getMoveDelta(dragState);
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return [];
      return dragState.originals.map((original) => {
        const originalNote = notes.find((note) => note.id === original.id);
        const pitch = Math.max(0, Math.min(127, original.pitch + deltaPitch));
        const start = Math.max(0, original.start + deltaTime);
        const duration = originalNote?.duration ?? original.duration;
        return {
          note: {
            ...(originalNote ?? {
              id: original.id,
              pitch: original.pitch,
              start: original.start,
              duration: original.duration,
              velocity: 100,
            }),
            pitch,
            start,
            duration,
          },
          x: timeToScreen(start),
          y: pitchToScreen(pitch) - noteHeight / 2,
          w: Math.max(6, duration * pixelsPerSecond),
          h: noteHeight,
        };
      });
    }

    if (dragState.type === "resize") {
      const note = notes.find((entry) => entry.id === dragState.noteId);
      if (!note) return [];
      const dx = dragState.currentX - dragState.startX;
      if (Math.abs(dx) <= 2) return [];

      if (dragState.edge === "right") {
        const duration = Math.max(
          0.01,
          dragState.originalDuration + dx / pixelsPerSecond,
        );
        return [
          {
            note: { ...note, duration },
            x: timeToScreen(note.start),
            y: pitchToScreen(note.pitch) - noteHeight / 2,
            w: Math.max(6, duration * pixelsPerSecond),
            h: noteHeight,
          },
        ];
      }

      const nextStart = Math.min(
        dragState.originalEnd - 0.01,
        dragState.originalStart + dx / pixelsPerSecond,
      );
      const duration = Math.max(0.01, dragState.originalEnd - nextStart);
      return [
        {
          note: { ...note, start: nextStart, duration },
          x: timeToScreen(nextStart),
          y: pitchToScreen(note.pitch) - noteHeight / 2,
          w: Math.max(6, duration * pixelsPerSecond),
          h: noteHeight,
        },
      ];
    }

    return [];
  }, [
    dragState,
    getMoveDelta,
    notes,
    timeToScreen,
    pitchToScreen,
    noteHeight,
    pixelsPerSecond,
  ]);

  const draggingNoteIds = useMemo(() => {
    if (!dragState) return new Set<string>();
    if (dragState.type === "move") {
      return dragState.duplicateOnDrop
        ? new Set<string>()
        : new Set(dragState.noteIds);
    }
    if (dragState.type === "resize") return new Set([dragState.noteId]);
    return new Set<string>();
  }, [dragState]);

  const lassoRect = useMemo(() => {
    if (dragState?.type !== "lasso") return null;
    return {
      x: Math.min(dragState.startX, dragState.currentX),
      y: Math.min(dragState.startY, dragState.currentY),
      w: Math.abs(dragState.currentX - dragState.startX),
      h: Math.abs(dragState.currentY - dragState.startY),
    };
  }, [dragState]);

  useEffect(() => {
    if (!onAuditionNotes) return;
    if (
      !dragState ||
      (dragState.type !== "move" && dragState.type !== "resize")
    )
      return;
    if (dragPreviewRects.length === 0) return;
    onAuditionNotes(dragPreviewRects.map((rect) => rect.note).slice(0, 4));
  }, [dragPreviewRects, dragState, onAuditionNotes]);

  const updateHoverState = useCallback(
    (x: number, y: number) => {
      const hit = hitTestNote(x, y);
      setHoveredEdge(hit?.resizeEdge ?? null);
      setHoveredNoteId(hit?.noteRect.note.id ?? null);
    },
    [hitTestNote],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      setContextMenu((state) => ({ ...state, open: false }));
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTestNote(x, y);

      if (tool === "erase") {
        if (hit) onDeleteNote(hit.noteRect.note.id);
        return;
      }

      if (tool === "split") {
        if (hit) onSplitNote?.(hit.noteRect.note.id, screenToTime(x));
        return;
      }

      if (hit && hit.resizeEdge) {
        setDragState({
          type: "resize",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          noteId: hit.noteRect.note.id,
          edge: hit.resizeEdge,
          originalStart: hit.noteRect.note.start,
          originalDuration: hit.noteRect.note.duration,
          originalEnd: hit.noteRect.note.start + hit.noteRect.note.duration,
        });
        svg.setPointerCapture(event.pointerId);
        return;
      }

      if (tool === "draw") {
        if (!hit) {
          const pitch = screenToPitch(y);
          const time = snapToGrid(
            screenToTime(x),
            bpm,
            snapGrid,
            timeSignature,
          );
          onAddNote(pitch, time);
        }
        return;
      }

      if (hit) {
        const noteId = hit.noteRect.note.id;
        const isSelected = selectedIds.has(noteId);

        if (!isSelected && !event.shiftKey) {
          onSelectNote(noteId, false);
        } else if (!isSelected && event.shiftKey) {
          onSelectNote(noteId, true);
        }

        const noteIds = isSelected ? Array.from(selectedIds) : [noteId];
        const originals = notes
          .filter((note) => noteIds.includes(note.id))
          .map((note) => ({
            id: note.id,
            start: note.start,
            pitch: note.pitch,
            duration: note.duration,
          }));

        setDragState({
          type: "move",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          noteId,
          noteIds,
          originals,
          duplicateOnDrop: event.altKey,
        });
        svg.setPointerCapture(event.pointerId);
        return;
      }

      if (!event.shiftKey) onDeselectAll();
      setDragState({
        type: "lasso",
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      });
      svg.setPointerCapture(event.pointerId);
    },
    [
      bpm,
      hitTestNote,
      notes,
      onAddNote,
      onDeleteNote,
      onDeselectAll,
      onSelectNote,
      onSplitNote,
      screenToPitch,
      screenToTime,
      selectedIds,
      snapGrid,
      timeSignature,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (!dragState) {
        updateHoverState(x, y);
        return;
      }

      setDragState((state) => {
        if (!state) return null;
        if (state.type === "move") {
          return {
            ...state,
            currentX: x,
            currentY: y,
            duplicateOnDrop: event.altKey,
          };
        }
        return { ...state, currentX: x, currentY: y };
      });
    },
    [dragState, updateHoverState],
  );

  const handlePointerLeave = useCallback(() => {
    if (!dragState) {
      setHoveredEdge(null);
      setHoveredNoteId(null);
    }
  }, [dragState]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = event.currentTarget;
      svg.releasePointerCapture(event.pointerId);

      if (dragState.type === "move") {
        const { dx, dy, deltaTime, deltaPitch } = getMoveDelta(dragState);
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          if (dragState.duplicateOnDrop) {
            onDuplicateNotes(dragState.noteIds, deltaPitch, deltaTime);
          } else {
            onMoveNotes(dragState.noteIds, deltaPitch, deltaTime);
          }
        }
      } else if (dragState.type === "resize") {
        const dx = dragState.currentX - dragState.startX;
        if (Math.abs(dx) > 3) {
          if (dragState.edge === "right") {
            const duration = Math.max(
              0.01,
              dragState.originalDuration + dx / pixelsPerSecond,
            );
            onResizeNote(dragState.noteId, dragState.originalStart, duration);
          } else {
            const nextStart = Math.min(
              dragState.originalEnd - 0.01,
              dragState.originalStart + dx / pixelsPerSecond,
            );
            const duration = Math.max(0.01, dragState.originalEnd - nextStart);
            onResizeNote(dragState.noteId, nextStart, duration);
          }
        }
      } else if (dragState.type === "lasso") {
        const x1 = Math.min(dragState.startX, dragState.currentX);
        const x2 = Math.max(dragState.startX, dragState.currentX);
        const y1 = Math.min(dragState.startY, dragState.currentY);
        const y2 = Math.max(dragState.startY, dragState.currentY);

        if (x2 - x1 > 5 || y2 - y1 > 5) {
          const hitIds = noteRects
            .filter(
              (rect) =>
                rect.x + rect.w > x1 &&
                rect.x < x2 &&
                rect.y + rect.h > y1 &&
                rect.y < y2,
            )
            .map((rect) => rect.note.id);
          if (hitIds.length > 0) {
            onSelectNotes(hitIds, event.shiftKey);
          }
        }
      }

      setDragState(null);
    },
    [
      dragState,
      getMoveDelta,
      noteRects,
      onDuplicateNotes,
      onMoveNotes,
      onResizeNote,
      onSelectNotes,
      pixelsPerSecond,
    ],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      event.preventDefault();
      const svg = event.currentTarget;
      const svgRect = svg.getBoundingClientRect();
      const shellRect = shellRef.current?.getBoundingClientRect();
      const x = event.clientX - svgRect.left;
      const y = event.clientY - svgRect.top;
      const hit = hitTestNote(x, y);

      if (hit && !selectedIds.has(hit.noteRect.note.id)) {
        onSelectNote(hit.noteRect.note.id, false);
      }

      setContextMenu({
        open: true,
        x: (shellRect ? event.clientX - shellRect.left : x) + 6,
        y: (shellRect ? event.clientY - shellRect.top : y) + 6,
        noteId: hit?.noteRect.note.id ?? null,
      });
    },
    [hitTestNote, onSelectNote, selectedIds],
  );

  const activeContextNote = useMemo(
    () => notes.find((note) => note.id === contextMenu.noteId) ?? null,
    [notes, contextMenu.noteId],
  );

  const contextTargetIds = useMemo(() => {
    if (activeContextNote) {
      return selectedIds.has(activeContextNote.id)
        ? Array.from(selectedIds)
        : [activeContextNote.id];
    }
    return Array.from(selectedIds);
  }, [activeContextNote, selectedIds]);

  const useCanvasNotes = notes.length >= CANVAS_NOTE_THRESHOLD;

  const cursorClass = dragState
    ? dragState.type === "resize"
      ? "cursor-ew-resize"
      : dragState.type === "move"
        ? dragState.duplicateOnDrop
          ? "cursor-copy"
          : "cursor-grabbing"
        : "cursor-crosshair"
    : hoveredEdge
      ? "cursor-ew-resize"
      : hoveredNoteId && tool === "select"
        ? "cursor-grab"
        : tool === "draw" || tool === "erase"
          ? "cursor-crosshair"
          : "cursor-default";

  const renderNoteRect = (
    rect: NoteRect,
    opts: { isSelected: boolean; isPreview?: boolean; isGhost?: boolean },
  ) => {
    const { isSelected, isPreview = false, isGhost = false } = opts;
    const isMuted = !!rect.note.muted;
    const fill = isMuted
      ? PIANO_ROLL.noteMutedFill
      : isPreview
        ? PIANO_ROLL.notePreviewFill
        : isSelected
          ? PIANO_ROLL.noteSelectedFill(rect.note.velocity)
          : PIANO_ROLL.noteFill(rect.note.velocity);
    const fillTop = isMuted
      ? PIANO_ROLL.noteMutedFill
      : isSelected
        ? PIANO_ROLL.noteSelectedFill(rect.note.velocity)
        : PIANO_ROLL.noteFillTop(rect.note.velocity);
    const stroke = isMuted
      ? PIANO_ROLL.noteMutedStroke
      : isPreview
        ? PIANO_ROLL.notePreviewStroke
        : isSelected
          ? PIANO_ROLL.noteSelectedStroke
          : PIANO_ROLL.noteStroke;

    return (
      <g
        key={isPreview ? `preview-${rect.note.id}` : rect.note.id}
        pointerEvents={isPreview ? "none" : "visiblePainted"}
        opacity={isGhost ? 0.4 : 1}
        data-note-id={rect.note.id}
        data-note-pitch={rect.note.pitch}
        style={{
          filter:
            isSelected && !isPreview
              ? `drop-shadow(0 0 8px ${PIANO_ROLL.noteSelectedGlow})`
              : undefined,
        }}
      >
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          rx={NOTE_BORDER_RADIUS}
          fill={fill}
          stroke={stroke}
          strokeWidth={isPreview || isSelected ? 1.5 : 1}
          strokeDasharray={isPreview ? "5 3" : undefined}
          data-testid={isPreview ? undefined : `midi-note-${rect.note.id}`}
        />
        <rect
          x={rect.x + 1}
          y={rect.y + 1}
          width={Math.max(1, rect.w - 2)}
          height={Math.max(2, rect.h * 0.42)}
          rx={Math.max(2, NOTE_BORDER_RADIUS - 1)}
          fill={fillTop}
          opacity={0.38}
        />
        <line
          x1={rect.x + 3}
          x2={Math.max(rect.x + 3, rect.x + rect.w - 3)}
          y1={rect.y + rect.h * 0.72}
          y2={rect.y + rect.h * 0.72}
          stroke={PIANO_ROLL.noteInnerLine(rect.note.velocity)}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        {rect.note.muted && (
          <line
            x1={rect.x + 3}
            x2={rect.x + rect.w - 3}
            y1={rect.y + 3}
            y2={rect.y + rect.h - 3}
            stroke={PIANO_ROLL.noteMutedStroke}
            strokeWidth={1}
          />
        )}
        {rect.w > 14 && (
          <rect
            x={rect.x + rect.w - 3}
            y={rect.y + 2}
            width={2}
            height={rect.h - 4}
            rx={1}
            fill={
              isSelected
                ? PIANO_ROLL.noteSelectedStroke
                : PIANO_ROLL.noteInnerLine(rect.note.velocity)
            }
            opacity={0.75}
          />
        )}
      </g>
    );
  };

  const firstTwoNoteIds = notes.slice(0, 2).map((note) => note.id);
  const firstNote = notes[0];

  return (
    <div
      ref={shellRef}
      className="midi-editor-canvas-shell"
      style={{ backgroundColor: PIANO_ROLL.surfaceRaised }}
    >
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-xl border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
        style={{ backgroundColor: PIANO_ROLL.surface }}
        data-testid="midi-editor-canvas"
      >
        <MidiTimelineRuler
          totalDuration={totalDuration}
          pixelsPerSecond={pixelsPerSecond}
          timelineWidth={timelineWidth}
          bpm={bpm}
          timeSignature={timeSignature}
          loopRegion={loopRegion ?? { enabled: false, start: 0, end: 4 }}
          playheadTime={playheadTime}
          onSeek={(time) => onSeek?.(time)}
          onLoopChange={(region) => onLoopChange?.(region)}
          onZoomLevelChange={onZoomLevelChange}
        />

        <div className="flex">
          <svg
            width={LEFT_MARGIN}
            height={height}
            className="shrink-0 select-none"
            style={{ backgroundColor: PIANO_ROLL.ruler }}
            aria-hidden
          >
            <rect
              x={0}
              y={0}
              width={LEFT_MARGIN}
              height={RULER_HEIGHT}
              fill={PIANO_ROLL.ruler}
            />
            {pitchRows.map((row) => {
              const keyWidth = row.isBlack
                ? LEFT_MARGIN * PIANO_ROLL.gutterBlackKeyWidthRatio
                : LEFT_MARGIN - 2;
              return (
                <g key={`key-${row.pitch}`}>
                  <rect
                    x={row.isBlack ? 0 : 1}
                    y={row.y}
                    width={keyWidth}
                    height={row.h}
                    fill={
                      row.isBlack
                        ? PIANO_ROLL.gutterBlackKey
                        : PIANO_ROLL.gutterWhiteKey
                    }
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={0.5}
                  />
                  {(row.pitch % 12 === 0 || pitchRange <= 24) && (
                    <text
                      x={row.isBlack ? 5 : 7}
                      y={row.y + row.h * 0.66}
                      fontSize={8}
                      fill={
                        row.isBlack
                          ? PIANO_ROLL.labelOnBlack
                          : PIANO_ROLL.labelOnWhite
                      }
                      fontFamily="monospace"
                    >
                      {midiToNoteName(row.pitch)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div
            ref={scrollRef}
            className={cn(
              "min-w-0 flex-1",
              isScrollable && "overflow-x-auto overflow-y-hidden",
            )}
            onScroll={(event) =>
              onTimelineScroll?.(event.currentTarget.scrollLeft)
            }
            title={
              isScrollable
                ? "Ctrl + wheel: horizontal zoom · Shift + wheel: vertical zoom"
                : undefined
            }
            style={{ touchAction: onZoomLevelChange ? "pan-x" : undefined }}
          >
            <div className="relative" style={{ width: timelineWidth, height }}>
              {useCanvasNotes && (
                <MidiNoteCanvasLayer
                  noteRects={noteRects.filter(
                    (rect) => !draggingNoteIds.has(rect.note.id),
                  )}
                  selectedIds={selectedIds}
                  width={timelineWidth}
                  height={height}
                  contentTop={CONTENT_TOP}
                  contentHeight={height - CONTENT_TOP - BOTTOM_MARGIN}
                  playheadX={playheadX}
                  lassoRect={lassoRect}
                  previewRects={dragPreviewRects}
                />
              )}

              <svg
                width={timelineWidth}
                height={height}
                className={cn(
                  "block select-none",
                  cursorClass,
                  useCanvasNotes && "relative",
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onContextMenu={handleContextMenu}
                role="application"
                aria-label={`MIDI note editor with ${notes.length} notes${isScrollable ? ", scroll horizontally for full timeline" : ""}`}
              >
                {pitchRows.map((row) => (
                  <g key={`row-${row.pitch}`}>
                    <rect
                      x={0}
                      y={row.y}
                      width={timelineWidth}
                      height={row.h}
                      fill={
                        row.isBlack
                          ? PIANO_ROLL.blackKeyRow
                          : PIANO_ROLL.whiteKeyRow
                      }
                    />
                    {scaleGuide && (
                      <rect
                        x={0}
                        y={row.y}
                        width={timelineWidth}
                        height={row.h}
                        fill={
                          row.inScale
                            ? PIANO_ROLL.scaleRowTint
                            : PIANO_ROLL.nonScaleRowShade
                        }
                      />
                    )}
                    {scaleGuide && row.pitch % 12 === 0 && row.inScale && (
                      <rect
                        x={0}
                        y={row.y}
                        width={timelineWidth}
                        height={row.h}
                        fill={PIANO_ROLL.scaleRowStrongTint}
                        opacity={0.55}
                      />
                    )}
                  </g>
                ))}

                {gridLines.map((line, index) => (
                  <line
                    key={`grid-${index}`}
                    x1={line.x}
                    x2={line.x}
                    y1={CONTENT_TOP}
                    y2={height - BOTTOM_MARGIN}
                    stroke={
                      line.level === "bar"
                        ? PIANO_ROLL.gridBar
                        : line.level === "beat"
                          ? PIANO_ROLL.gridBeat
                          : PIANO_ROLL.gridSubdivision
                    }
                    strokeWidth={
                      line.level === "bar"
                        ? 1.25
                        : line.level === "beat"
                          ? 0.8
                          : 0.45
                    }
                  />
                ))}

                {pitchRows.map((row) => (
                  <line
                    key={`row-line-${row.pitch}`}
                    x1={0}
                    x2={timelineWidth}
                    y1={row.y + row.h}
                    y2={row.y + row.h}
                    stroke={
                      row.pitch % 12 === 0
                        ? PIANO_ROLL.rowLineC
                        : PIANO_ROLL.rowLine
                    }
                    strokeWidth={row.pitch % 12 === 0 ? 0.8 : 0.5}
                  />
                ))}

                {loopRegion && (
                  <MidiLoopRegionOverlay
                    loopRegion={loopRegion}
                    pixelsPerSecond={pixelsPerSecond}
                    contentTop={CONTENT_TOP}
                    contentHeight={height - CONTENT_TOP - BOTTOM_MARGIN}
                    timelineWidth={timelineWidth}
                  />
                )}

                {!useCanvasNotes &&
                  noteRects.map((rect) =>
                    renderNoteRect(rect, {
                      isSelected: selectedIds.has(rect.note.id),
                      isGhost: draggingNoteIds.has(rect.note.id),
                    }),
                  )}

                {!useCanvasNotes &&
                  dragPreviewRects.map((rect) =>
                    renderNoteRect(rect, { isSelected: true, isPreview: true }),
                  )}

                {!useCanvasNotes && lassoRect && (
                  <rect
                    x={lassoRect.x}
                    y={lassoRect.y}
                    width={lassoRect.w}
                    height={lassoRect.h}
                    fill={PIANO_ROLL.lassoFill}
                    stroke={PIANO_ROLL.lassoStroke}
                    strokeWidth={1}
                    strokeDasharray="5 3"
                    rx={4}
                  />
                )}

                {!useCanvasNotes && playheadX != null && (
                  <g pointerEvents="none">
                    <line
                      x1={playheadX}
                      x2={playheadX}
                      y1={CONTENT_TOP}
                      y2={height - BOTTOM_MARGIN}
                      stroke={PIANO_ROLL.playheadGlow}
                      strokeWidth={5}
                    />
                    <line
                      x1={playheadX}
                      x2={playheadX}
                      y1={CONTENT_TOP}
                      y2={height - BOTTOM_MARGIN}
                      stroke={PIANO_ROLL.playhead}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  </g>
                )}
              </svg>
            </div>
          </div>
        </div>

        {isScrollable && (
          <p
            className="border-t border-border px-sm py-1.5 text-[10px] text-muted-foreground"
            style={{ backgroundColor: PIANO_ROLL.ruler }}
          >
            Scroll timeline horizontally · Ctrl + wheel zooms horizontally ·
            Shift + wheel zooms vertically
          </p>
        )}
      </div>

      {e2eMode && firstNote && (
        <div
          className="mb-2 flex flex-wrap gap-2"
          data-testid="midi-e2e-controls"
        >
          <button
            type="button"
            className="midi-btn"
            data-testid="e2e-marquee-select"
            onClick={() => onSelectNotes(firstTwoNoteIds, false)}
          >
            E2E Marquee Select
          </button>
          <button
            type="button"
            className="midi-btn"
            data-testid="e2e-alt-duplicate"
            onClick={() => onDuplicateNotes([firstNote.id], 0, gridSizeSeconds)}
          >
            E2E Alt Duplicate
          </button>
          <button
            type="button"
            className="midi-btn"
            data-testid="e2e-resize-first"
            onClick={() =>
              onResizeNote(
                firstNote.id,
                firstNote.start,
                firstNote.duration + gridSizeSeconds,
              )
            }
          >
            E2E Resize First
          </button>
          <button
            type="button"
            className="midi-btn"
            data-testid="e2e-open-context-menu"
            onClick={() =>
              setContextMenu({
                open: true,
                x: 160,
                y: 96,
                noteId: firstNote.id,
              })
            }
          >
            E2E Open Context Menu
          </button>
        </div>
      )}

      <MidiContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        note={activeContextNote}
        hasSelection={selectedIds.size > 0}
        onClose={() => setContextMenu((state) => ({ ...state, open: false }))}
        onDelete={() => {
          const targets = contextTargetIds;
          if (targets.length === 0) return;
          if (
            activeContextNote &&
            targets.length === 1 &&
            targets[0] === activeContextNote.id
          ) {
            onDeleteNote(activeContextNote.id);
          } else {
            onSelectNotes(targets, false);
            for (const target of targets) {
              onDeleteNote(target);
            }
          }
          setContextMenu((state) => ({ ...state, open: false }));
        }}
        onQuantize={() => {
          if (activeContextNote && contextTargetIds.length > 0) {
            onQuantizeNotes(contextTargetIds);
          } else {
            onQuantizeSelection();
          }
          setContextMenu((state) => ({ ...state, open: false }));
        }}
        onToggleMute={() => {
          if (activeContextNote) {
            onToggleMuteNote(activeContextNote.id, !activeContextNote.muted);
          }
          setContextMenu((state) => ({ ...state, open: false }));
        }}
        onChannelChange={(channel) => {
          if (activeContextNote)
            onSetNoteChannel(activeContextNote.id, channel);
        }}
        onLegato={() => {
          onLegatoSelection();
          setContextMenu((state) => ({ ...state, open: false }));
        }}
        onHumanize={() => {
          onHumanizeSelection();
          setContextMenu((state) => ({ ...state, open: false }));
        }}
      />
    </div>
  );
}
