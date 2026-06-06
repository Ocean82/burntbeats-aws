import type { LoopRegion } from "./editorTypes";
import { PIANO_ROLL } from "./pianoRollTheme";

interface MidiLoopRegionOverlayProps {
  loopRegion: LoopRegion;
  pixelsPerSecond: number;
  contentTop: number;
  contentHeight: number;
  timelineWidth: number;
}

export function MidiLoopRegionOverlay({
  loopRegion,
  pixelsPerSecond,
  contentTop,
  contentHeight,
}: MidiLoopRegionOverlayProps) {
  if (!loopRegion.enabled || loopRegion.start >= loopRegion.end) return null;

  const x = loopRegion.start * pixelsPerSecond;
  const w = (loopRegion.end - loopRegion.start) * pixelsPerSecond;

  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={contentTop}
        width={w}
        height={contentHeight}
        fill={PIANO_ROLL.loopRegionFill}
        stroke={PIANO_ROLL.loopRegionBorder}
        strokeWidth={1}
        strokeDasharray="6 3"
        rx={2}
      />
      <line
        x1={x}
        x2={x}
        y1={contentTop}
        y2={contentTop + contentHeight}
        stroke={PIANO_ROLL.loopRegionHandle}
        strokeWidth={2}
      />
      <line
        x1={x + w}
        x2={x + w}
        y1={contentTop}
        y2={contentTop + contentHeight}
        stroke={PIANO_ROLL.loopRegionHandle}
        strokeWidth={2}
      />
    </g>
  );
}
