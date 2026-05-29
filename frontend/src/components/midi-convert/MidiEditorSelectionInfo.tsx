/**
 * MidiEditorSelectionInfo — inspector strip for selected notes (DAW-style).
 */
import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
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

  const selectionKey = selectedNotes.map((n) => n.id).join(",");

  return (
    <MidiEditorSelectionInfoBody
      key={selectionKey}
      selectedNotes={selectedNotes}
      onDelete={onDelete}
      onTranspose={onTranspose}
      onSetVelocity={onSetVelocity}
    />
  );
}

function MidiEditorSelectionInfoBody({
  selectedNotes,
  onDelete,
  onTranspose,
  onSetVelocity,
}: MidiEditorSelectionInfoProps) {
  const pitches = selectedNotes.map((n) => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const velocities = selectedNotes.map((n) => n.velocity);
  const allSameVelocity = velocities.every((v) => v === velocities[0]);
  const avgVelocity = Math.round(
    velocities.reduce((sum, v) => sum + v, 0) / velocities.length,
  );
  const [velocityOverride, setVelocityOverride] = useState<number | null>(null);

  const sliderValue = velocityOverride ?? (allSameVelocity ? velocities[0] : avgVelocity);
  const displayVelocity =
    velocityOverride ?? (allSameVelocity ? velocities[0] : null);

  return (
    <div className="flex flex-wrap items-center gap-sm px-sm py-xs text-xs">
      <span className="font-medium text-secondary-foreground">
        {selectedNotes.length} selected
      </span>

      <span className="text-muted-foreground">|</span>

      <span className="text-muted-foreground" title="Pitch range">
        {minPitch === maxPitch
          ? midiToNoteName(minPitch)
          : `${midiToNoteName(minPitch)} – ${midiToNoteName(maxPitch)}`}
      </span>

      <span className="text-muted-foreground">|</span>

      <div className="flex items-center gap-xs" title="Transpose in semitones">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Transpose</span>
        <button
          type="button"
          onClick={() => onTranspose(-1)}
          aria-label="Down 1 semitone"
          className="flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-secondary-foreground transition hover:bg-muted"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onTranspose(1)}
          aria-label="Up 1 semitone"
          className="flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-secondary-foreground transition hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
        </button>
        <span className="text-[10px] text-muted-foreground">st</span>
      </div>

      <span className="text-muted-foreground">|</span>

      <div className="flex items-center gap-xs" title="Note velocity (1–127)">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Velocity</span>
        <input
          type="range"
          min={1}
          max={127}
          value={sliderValue}
          onChange={(e) => {
            const vel = parseInt(e.target.value, 10);
            setVelocityOverride(vel);
            onSetVelocity(vel);
          }}
          className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted accent-success-500"
          aria-label={
            allSameVelocity
              ? "Set velocity for selected notes"
              : "Set velocity (selection has mixed values; starts at average)"
          }
        />
        <span className="min-w-[2.5rem] font-mono text-[10px] text-muted-foreground">
          {displayVelocity != null
            ? displayVelocity
            : `${avgVelocity}*`}
        </span>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onDelete}
        title="Delete selected notes (Del)"
        aria-label="Delete selected notes"
        className="flex h-7 items-center gap-2xs rounded border border-destructive-400/30 bg-destructive-500/10 px-xs text-destructive-200 transition hover:bg-destructive-500/20"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>
  );
}
