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
      const muted = !!r.note.muted;
      ctx.globalAlpha = ghost ? 0.4 : 1;
      ctx.setLineDash(preview ? [5, 3] : []);

      if (selected && !preview) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = PIANO_ROLL.noteSelectedGlow;
      }

      ctx.fillStyle = muted
        ? PIANO_ROLL.noteMutedFill
        : preview
          ? PIANO_ROLL.notePreviewFill
          : selected
            ? PIANO_ROLL.noteSelectedFill(r.note.velocity)
            : PIANO_ROLL.noteFill(r.note.velocity);
      ctx.strokeStyle = muted
        ? PIANO_ROLL.noteMutedStroke
        : preview
          ? PIANO_ROLL.notePreviewStroke
          : selected
            ? PIANO_ROLL.noteSelectedStroke
            : PIANO_ROLL.noteStroke;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      ctx.lineWidth = preview || selected ? 1.5 : 1;
      ctx.stroke();

      if (selected && !preview) {
        ctx.restore();
      }

      ctx.fillStyle = muted
        ? PIANO_ROLL.noteMutedFill
        : selected
          ? PIANO_ROLL.noteSelectedFill(r.note.velocity)
          : PIANO_ROLL.noteFillTop(r.note.velocity);
      ctx.globalAlpha = ghost ? 0.18 : 0.34;
      ctx.beginPath();
      ctx.roundRect(
        r.x + 1,
        r.y + 1,
        Math.max(1, r.w - 2),
        Math.max(2, r.h * 0.42),
        3,
      );
      ctx.fill();
      ctx.globalAlpha = ghost ? 0.4 : 1;

      ctx.strokeStyle = muted
        ? PIANO_ROLL.noteMutedStroke
        : PIANO_ROLL.noteInnerLine(r.note.velocity);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(r.x + 3, r.y + r.h * 0.72);
      ctx.lineTo(Math.max(r.x + 3, r.x + r.w - 3), r.y + r.h * 0.72);
      ctx.stroke();

      if (muted) {
        ctx.beginPath();
        ctx.moveTo(r.x + 3, r.y + 3);
        ctx.lineTo(r.x + r.w - 3, r.y + r.h - 3);
        ctx.stroke();
      }

      if (r.w > 14) {
        ctx.fillStyle = selected
          ? PIANO_ROLL.noteSelectedStroke
          : PIANO_ROLL.noteInnerLine(r.note.velocity);
        ctx.fillRect(r.x + r.w - 3, r.y + 2, 2, Math.max(2, r.h - 4));
      }

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
      ctx.strokeStyle = PIANO_ROLL.playheadGlow;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(playheadX, contentTop);
      ctx.lineTo(playheadX, contentTop + contentHeight);
      ctx.stroke();

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
