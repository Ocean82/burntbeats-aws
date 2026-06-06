import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EditableNote } from "./editorTypes";
import { VELOCITY_LANE_HEIGHT, PIANO_ROLL } from "./pianoRollTheme";

interface MidiVelocityLaneProps {
  notes: EditableNote[];
  selectedIds: Set<string>;
  pixelsPerSecond: number;
  totalDuration: number;
  timelineWidth: number;
  onSetNoteVelocity: (noteId: string, velocity: number) => void;
  onSetSelectedVelocity: (velocity: number) => void;
}

interface DragVelocityState {
  noteId: string;
  startY: number;
  startVelocity: number;
}

export function MidiVelocityLane({
  notes,
  selectedIds,
  pixelsPerSecond,
  totalDuration,
  timelineWidth,
  onSetNoteVelocity,
  onSetSelectedVelocity,
}: MidiVelocityLaneProps) {
  const [dragState, setDragState] = useState<DragVelocityState | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const timeToScreen = useCallback(
    (t: number) => t * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const noteAtX = [...notes]
        .reverse()
        .find((n) => {
          const nx = timeToScreen(n.start);
          const nw = Math.max(4, n.duration * pixelsPerSecond);
          return x >= nx && x <= nx + nw;
        });

      if (noteAtX) {
        setDragState({
          noteId: noteAtX.id,
          startY: y,
          startVelocity: noteAtX.velocity,
        });
        svg.setPointerCapture(e.pointerId);
      }
    },
    [notes, timeToScreen, pixelsPerSecond],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const dy = dragState.startY - y;
      const velocityDelta = Math.round((dy / (VELOCITY_LANE_HEIGHT - 8)) * 127);
      const newVelocity = Math.max(1, Math.min(127, dragState.startVelocity + velocityDelta));
      onSetNoteVelocity(dragState.noteId, newVelocity);
    },
    [dragState, onSetNoteVelocity],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragState) {
        const svg = svgRef.current;
        if (svg) svg.releasePointerCapture(e.pointerId);
        if (selectedIds.has(dragState.noteId) && selectedIds.size > 1) {
          const note = notes.find((n) => n.id === dragState.noteId);
          if (note) {
            onSetSelectedVelocity(note.velocity);
          }
        }
        setDragState(null);
      }
    },
    [dragState, selectedIds, notes, onSetSelectedVelocity],
  );

  const maxTime = Math.max(totalDuration, 4);
  const svgWidth = Math.max(timelineWidth, Math.ceil(maxTime * pixelsPerSecond));

  return (
    <div
      className="midi-velocity-lane"
      style={{ height: VELOCITY_LANE_HEIGHT }}
    >
      <svg
        ref={svgRef}
        width={svgWidth}
        height={VELOCITY_LANE_HEIGHT}
        className="block cursor-pointer select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="application"
        aria-label="Velocity lane. Click and drag bars to adjust note velocity."
      >
        <rect
          x={0}
          y={0}
          width={svgWidth}
          height={VELOCITY_LANE_HEIGHT}
          fill={PIANO_ROLL.velocityLaneSurface}
        />
        {notes.map((note) => {
          const x = timeToScreen(note.start);
          const w = Math.max(4, note.duration * pixelsPerSecond);
          const barHeight = (note.velocity / 127) * (VELOCITY_LANE_HEIGHT - 8);
          const barY = VELOCITY_LANE_HEIGHT - 4 - barHeight;
          const isSelected = selectedIds.has(note.id);
          const isHovered = hoveredNoteId === note.id;
          const isDragging = dragState?.noteId === note.id;

          return (
            <g
              key={note.id}
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
            >
              <rect
                x={x}
                y={barY}
                width={Math.max(w, 2)}
                height={barHeight}
                fill={
                  isDragging
                    ? PIANO_ROLL.velocityBarHover
                    : isSelected
                      ? PIANO_ROLL.velocityBarSelectedFill
                      : PIANO_ROLL.velocityBarFill(note.velocity)
                }
                stroke={
                  isHovered || isDragging
                    ? PIANO_ROLL.velocityBarHover
                    : PIANO_ROLL.velocityBarStroke
                }
                strokeWidth={isDragging ? 1.5 : 0.5}
                rx={1}
              />
              {(isHovered || isDragging) && (
                <text
                  x={x + w + 4}
                  y={barY + 10}
                  fontSize={9}
                  fill={PIANO_ROLL.rulerText}
                  fontFamily="monospace"
                >
                  {note.velocity}
                </text>
              )}
            </g>
          );
        })}
        {dragState && (
          <line
            x1={0}
            x2={svgWidth}
            y1={VELOCITY_LANE_HEIGHT - 4}
            y2={VELOCITY_LANE_HEIGHT - 4}
            stroke={PIANO_ROLL.gridBar}
            strokeWidth={0.5}
          />
        )}
      </svg>
    </div>
  );
}
