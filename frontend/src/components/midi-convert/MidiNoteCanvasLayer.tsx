import { useCallback, useEffect, useRef } from "react";
import type { EditableNote } from "./editorTypes";
import { PIANO_ROLL } from "./pianoRollTheme";

export const CANVAS_NOTE_THRESHOLD = 400;

interface NoteRect {
  note: EditableNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MidiNoteCanvasLayerProps {
  noteRects: NoteRect[];
  selectedIds: Set<string>;
  width: number;
  height: number;
  contentTop: number;
  contentHeight: number;
  playheadX: number | null;
  lassoRect?: { x: number; y: number; w: number; h: number } | null;
  previewRects?: NoteRect[];
}

export function MidiNoteCanvasLayer({
  noteRects,
  selectedIds,
  width,
  height,
  contentTop,
  contentHeight,
  playheadX,
  lassoRect,
  previewRects = [],
}: MidiNoteCanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, width, height);

    const drawRect = (
      r: NoteRect,
      opts: { selected: boolean; preview?: boolean; ghost?: boolean },
    ) => {
      const { selected, preview = false, ghost = false } = opts;
      ctx.globalAlpha = ghost ? 0.35 : 1;
      if (preview) {
        ctx.fillStyle = PIANO_ROLL.notePreviewFill;
        ctx.strokeStyle = PIANO_ROLL.notePreviewStroke;
        ctx.setLineDash([4, 3]);
      } else if (selected) {
        ctx.fillStyle = PIANO_ROLL.noteSelectedFill(r.note.velocity);
        ctx.strokeStyle = PIANO_ROLL.noteSelectedStroke;
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = PIANO_ROLL.noteFill(r.note.velocity);
        ctx.strokeStyle = PIANO_ROLL.noteStroke;
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 2);
      ctx.fill();
      ctx.lineWidth = preview || selected ? 1.5 : 0.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    for (const r of noteRects) {
      drawRect(r, { selected: selectedIds.has(r.note.id) });
    }
    for (const r of previewRects) {
      drawRect(r, { selected: true, preview: true });
    }

    if (lassoRect && (lassoRect.w > 0 || lassoRect.h > 0)) {
      ctx.fillStyle = PIANO_ROLL.lassoFill;
      ctx.strokeStyle = PIANO_ROLL.lassoStroke;
      ctx.setLineDash([4, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lassoRect.x, lassoRect.y, lassoRect.w, lassoRect.h, 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (playheadX != null) {
      ctx.strokeStyle = PIANO_ROLL.playhead;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, contentTop);
      ctx.lineTo(playheadX, contentTop + contentHeight);
      ctx.stroke();
    }
  }, [
    noteRects,
    selectedIds,
    width,
    height,
    contentTop,
    contentHeight,
    playheadX,
    lassoRect,
    previewRects,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute left-0 top-0 block"
      aria-hidden
    />
  );
}
