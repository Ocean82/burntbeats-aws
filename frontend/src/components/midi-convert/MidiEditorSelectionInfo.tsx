/**
 * MidiEditorSelectionInfo — displays info about selected notes and bulk actions.
 */
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { EditableNote } from "../../hooks/useMidiEditor";
import { midiToNoteName } from "../../utils/musicTheory";

interface MidiEditorSelectionInfoProps {
  selectedNotes: EditableNote[];
  onDelete: () => void;
  onTranspose: (semitones: number) => void;
  onSetVelocity: (velocity: number) => void;
}

export function MidiEditorSelectionInfo({
  selectedNotes,
  onDelete,
  onTranspose,
  onSetVelocity,
}: MidiEditorSelectionInfoProps) {
  if (selectedNotes.length === 0) return null;

  const pitches = selectedNotes.map((n) => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const avgVelocity = Math.round(
    selectedNotes.reduce((sum, n) => sum + n.velocity, 0) / selectedNotes.length,
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-400/15 bg-violet-950/20 px-3 py-2 text-xs">
      <span className="font-medium text-violet-200">
        {selectedNotes.length} note{selectedNotes.length !== 1 ? "s" : ""} selected
      </span>

      <span className="text-white/40">|</span>

      <span className="text-white/60">
        {minPitch === maxPitch
          ? midiToNoteName(minPitch)
          : `${midiToNoteName(minPitch)} – ${midiToNoteName(maxPitch)}`}
      </span>

      <span className="text-white/40">|</span>

      <span className="text-white/60">
        Vel: {avgVelocity}
      </span>

      <div className="flex-1" />

      {/* Transpose buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onTranspose(-1)}
          aria-label="Transpose down 1 semitone"
          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-white/60 transition hover:border-white/20 hover:text-white"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onTranspose(1)}
          aria-label="Transpose up 1 semitone"
          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-white/5 text-white/60 transition hover:border-white/20 hover:text-white"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <span className="ml-1 text-[10px] text-white/35">±1 st</span>
      </div>

      {/* Velocity quick set */}
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={1}
          max={127}
          value={avgVelocity}
          onChange={(e) => onSetVelocity(parseInt(e.target.value, 10))}
          className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400"
          aria-label="Set velocity for selected notes"
        />
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete selected notes"
        className="flex h-7 items-center gap-1 rounded border border-red-400/30 bg-red-500/10 px-2 text-red-200 transition hover:bg-red-500/20"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>
  );
}
