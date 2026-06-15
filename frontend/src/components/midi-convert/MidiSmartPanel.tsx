/**
 * MidiSmartPanel — diatonic chord suggestions with Tone.js preview.
 */
import { Lock, Plus, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PolySynth, start, Synth } from "tone";
import {
  getDiatonicChords,
  midiToFreq,
  type RootNote,
  type Scale,
  NOTE_NAMES,
  SCALE_INTERVALS,
} from "../../utils/musicTheory";
import { cn } from "../../utils/cn";
import { SectionLabel } from "../ui";

const SCALES: Scale[] = [
  "major",
  "minor",
  "dorian",
  "mixolydian",
  "pentatonic",
];

export interface MidiSmartPanelProps {
  root?: RootNote;
  scale?: Scale;
  onInsertChord?: (notes: number[]) => void;
  onScaleChange?: (state: {
    root: RootNote;
    scale: Scale;
    locked: boolean;
  }) => void;
  scaleLockDisabled?: boolean;
  className?: string;
}

export function MidiSmartPanel({
  root: initialRoot = "C",
  scale: initialScale = "major",
  onInsertChord,
  onScaleChange,
  scaleLockDisabled = false,
  className,
}: MidiSmartPanelProps) {
  const [root, setRoot] = useState<RootNote>(initialRoot);
  const [scale, setScale] = useState<Scale>(initialScale);
  const [scaleLock, setScaleLock] = useState(() => !scaleLockDisabled);
  const synthRef = useRef<InstanceType<typeof PolySynth> | null>(null);

  const chords = useMemo(() => getDiatonicChords(root, scale), [root, scale]);

  useEffect(() => {
    if (scaleLockDisabled) setScaleLock(false);
  }, [scaleLockDisabled]);

  useEffect(() => {
    onScaleChange?.({ root, scale, locked: scaleLockDisabled ? false : scaleLock });
  }, [root, scale, scaleLock, scaleLockDisabled, onScaleChange]);

  const previewChord = useCallback(async (midiNotes: number[]) => {
    await start();
    if (!synthRef.current) {
      synthRef.current = new PolySynth(Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.5 },
      }).toDestination();
      synthRef.current.volume.value = -10;
    }
    const freqs = midiNotes.map((m) => midiToFreq(m));
    synthRef.current.triggerAttackRelease(freqs, "8n");
  }, []);

  const handleChordClick = useCallback(
    (midiNotes: number[]) => {
      void previewChord(midiNotes);
    },
    [previewChord],
  );

  const handleChordInsert = useCallback(
    (midiNotes: number[]) => {
      onInsertChord?.(midiNotes);
    },
    [onInsertChord],
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/40 p-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-xs">
        <div>
          <SectionLabel>Smart chords</SectionLabel>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Click to preview · double-click or + to insert
          </p>
        </div>
        <button
          type="button"
          onClick={() => setScaleLock((v) => !v)}
          disabled={scaleLockDisabled}
          className={cn(
            "inline-flex items-center gap-1 rounded px-xs py-0.5 text-[10px] font-medium",
            scaleLock ? "text-primary-300" : "text-muted-foreground",
            scaleLockDisabled && "opacity-50 cursor-not-allowed",
          )}
          title={
            scaleLockDisabled
              ? "Scale lock disabled for drum content"
              : scaleLock
                ? "Scale locked"
                : "Scale unlocked"
          }
          aria-label={
            scaleLockDisabled
              ? "Scale lock unavailable for drum content"
              : scaleLock
                ? "Unlock scale guide"
                : "Lock scale guide"
          }
        >
          {scaleLock ? (
            <Lock className="h-3 w-3" aria-hidden />
          ) : (
            <Unlock className="h-3 w-3" aria-hidden />
          )}
          {scaleLock ? "Locked" : "Free"}
        </button>
      </div>

      <div className="mt-sm flex flex-wrap gap-xs">
        <select
          value={root}
          onChange={(e) => setRoot(e.target.value as RootNote)}
          disabled={scaleLock}
          className="rounded border border-border bg-muted px-xs py-0.5 text-xs"
          aria-label="Root note"
        >
          {NOTE_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value as Scale)}
          disabled={scaleLock}
          className="rounded border border-border bg-muted px-xs py-0.5 text-xs"
          aria-label="Scale"
        >
          {SCALES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-xs text-[10px] text-muted-foreground">
        {root} {scale} · {SCALE_INTERVALS[scale].length} scale degrees
      </p>

      <div className="mt-sm grid grid-cols-2 gap-xs sm:grid-cols-3">
        {chords.map((chord) => (
          <div key={chord.name} className="relative flex">
            <button
              type="button"
              onClick={() => handleChordClick(chord.midi)}
              onDoubleClick={() => handleChordInsert(chord.midi)}
              className="min-w-0 flex-1 rounded-md border border-accent-midi/25 bg-accent-midi/10 px-sm py-xs text-xs font-medium text-accent-midi-200 transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-200"
              data-testid={`smart-chord-${chord.name}`}
            >
              {chord.name}
            </button>
            {onInsertChord ? (
              <button
                type="button"
                onClick={() => handleChordInsert(chord.midi)}
                className="ml-0.5 inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/50 px-1 text-accent-midi-300 hover:bg-accent-midi/10"
                aria-label={`Insert ${chord.name} chord`}
                title={`Insert ${chord.name}`}
              >
                <Plus className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
