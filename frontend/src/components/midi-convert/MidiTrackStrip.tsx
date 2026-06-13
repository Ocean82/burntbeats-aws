import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, VolumeX, Volume2, Headphones, X } from "lucide-react";
import type { EditorTrack, TrackInstrument } from "./editorTypes";
import { TRACK_INSTRUMENTS } from "./editorTypes";

/** Safely apply alpha to a hex color. Falls back to CSS color-mix for non-hex values. */
function colorWithAlpha(color: string, alphaHex: string): string | undefined {
  // Only append alpha suffix to valid 6-digit hex colors
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return `${color}${alphaHex}`;
  }
  // For any other format, use color-mix (modern browsers)
  return `color-mix(in srgb, ${color} 33%, transparent)`;
}

interface MidiTrackStripProps {
  track: EditorTrack;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onRemove: () => void;
  onSetInstrument: (instrument: TrackInstrument) => void;
}

export function MidiTrackStrip({
  track,
  isActive,
  onSelect,
  onRename,
  onToggleMute,
  onToggleSolo,
  onRemove,
  onSetInstrument,
}: MidiTrackStripProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = useCallback(() => {
    setEditName(track.name);
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [track.name]);

  const handleFinishEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== track.name) {
      onRename(trimmed);
    }
  }, [editName, track.name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    },
    [onSelect],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      className={`midi-track-strip${isActive ? " midi-track-strip--active" : ""}${track.soloed ? " midi-track-strip--soloed" : ""}${track.muted ? " midi-track-strip--muted" : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      aria-label={`Track: ${track.name}`}
      style={isActive ? { borderColor: colorWithAlpha(track.color, "55") } : undefined}
    >
      <div className="midi-track-strip__indicator" style={{ backgroundColor: track.color }} />
      <div className="midi-track-strip__body">
        <div className="midi-track-strip__name-row">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishEdit();
                if (e.key === "Escape") setIsEditing(false);
              }}
              className="midi-track-strip__name-input"
              aria-label="Track name"
            />
          ) : (
            <span
              className="midi-track-strip__name"
              onDoubleClick={handleStartEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStartEdit();
              }}
              tabIndex={-1}
              role="button"
              title={track.name}
            >
              {track.name}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="midi-track-strip__icon-btn"
            aria-label="Rename track"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        </div>
        <div className="midi-track-strip__controls">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className={`midi-track-strip__btn ${track.muted ? "midi-track-strip__btn--active" : ""}`}
            aria-label={track.muted ? "Unmute track" : "Mute track"}
            aria-pressed={track.muted}
          >
            {track.muted ? (
              <VolumeX className="h-3 w-3" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSolo();
            }}
            className={`midi-track-strip__btn ${track.soloed ? "midi-track-strip__btn--solo" : ""}`}
            aria-label={track.soloed ? "Unsolo track" : "Solo track"}
            aria-pressed={track.soloed}
          >
            <Headphones className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="midi-track-strip__btn midi-track-strip__btn--danger"
            aria-label="Remove track"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
        <select
          value={track.instrument}
          onChange={(e) => {
            e.stopPropagation();
            onSetInstrument(e.target.value as TrackInstrument);
          }}
          onClick={(e) => e.stopPropagation()}
          className="midi-track-strip__instrument-select"
          aria-label={`Instrument for ${track.name}`}
        >
          {TRACK_INSTRUMENTS.map((inst) => (
            <option key={inst.value} value={inst.value}>
              {inst.label}
            </option>
          ))}
        </select>
        <div className="midi-track-strip__stats">
          <span className="text-[8px] opacity-50">
            {track.notes.length} notes
          </span>
        </div>
      </div>
    </div>
  );
}
