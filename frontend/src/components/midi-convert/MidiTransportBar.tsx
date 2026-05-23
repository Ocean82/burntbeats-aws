/**
 * MIDI editor transport — play/stop, time display (familiar DAW top row).
 */
import { Play, Square } from "lucide-react";
import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";

function formatTransportTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const frac = Math.floor((s % 1) * 10);
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}.${frac}`;
  }
  return `${secs}.${frac}s`;
}

export interface MidiTransportBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bpm: number;
  isSupported: boolean;
  onPlay: () => void;
  onStop: () => void;
}

export function MidiTransportBar({
  isPlaying,
  currentTime,
  duration,
  bpm,
  isSupported,
  onPlay,
  onStop,
}: MidiTransportBarProps) {
  return (
    <div className="midi-transport-bar" role="group" aria-label="Transport">
      <MidiPhysicalButton
        variant="play"
        onClick={onPlay}
        disabled={!isSupported || isPlaying}
        title="Play (Space)"
        aria-label="Play"
      >
        <Play className="h-4 w-4 fill-current" aria-hidden />
        <span className="hidden sm:inline">Play</span>
      </MidiPhysicalButton>

      <MidiPhysicalButton
        variant="icon"
        onClick={onStop}
        disabled={!isSupported}
        title="Stop"
        aria-label="Stop"
      >
        <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
      </MidiPhysicalButton>

      <span className="midi-time-display" aria-live="polite" aria-label="Playhead position">
        {formatTransportTime(currentTime)}
        <span className="opacity-45"> / </span>
        {formatTransportTime(duration)}
      </span>

      <span
        className="rounded px-xs py-1 font-mono text-xs text-muted-foreground"
        style={{ background: "var(--midi-surface-inset)" }}
        title="Tempo"
      >
        {bpm} BPM
      </span>

      {!isSupported && (
        <span className="text-meta text-primary-300/80">Preview unavailable in this browser</span>
      )}
    </div>
  );
}
