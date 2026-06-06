import { Plus } from "lucide-react";
import type { EditorTrack, TrackInstrument } from "./editorTypes";
import { MidiTrackStrip } from "./MidiTrackStrip";
import { PIANO_ROLL } from "./pianoRollTheme";

interface MidiTrackListProps {
  tracks: EditorTrack[];
  activeTrackId: string;
  onSetActiveTrack: (trackId: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onSetInstrument: (trackId: string, instrument: TrackInstrument) => void;
}

export function MidiTrackList({
  tracks,
  activeTrackId,
  onSetActiveTrack,
  onAddTrack,
  onRemoveTrack,
  onRenameTrack,
  onToggleMute,
  onToggleSolo,
  onSetInstrument,
}: MidiTrackListProps) {
  return (
    <div
      className="midi-track-list"
      style={{ backgroundColor: PIANO_ROLL.trackStripBg }}
    >
      <div className="midi-track-list__header">
        <span className="text-[9px] font-semibold uppercase tracking-wider opacity-50">
          Tracks
        </span>
        <button
          type="button"
          onClick={onAddTrack}
          className="midi-track-strip__icon-btn"
          aria-label="Add new track"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="midi-track-list__body">
        {tracks.map((track) => (
          <MidiTrackStrip
            key={track.id}
            track={track}
            isActive={track.id === activeTrackId}
            onSelect={() => onSetActiveTrack(track.id)}
            onRename={(name) => onRenameTrack(track.id, name)}
            onToggleMute={() => onToggleMute(track.id)}
            onToggleSolo={() => onToggleSolo(track.id)}
            onRemove={() => onRemoveTrack(track.id)}
            onSetInstrument={(instrument) => onSetInstrument(track.id, instrument)}
          />
        ))}
      </div>
    </div>
  );
}
