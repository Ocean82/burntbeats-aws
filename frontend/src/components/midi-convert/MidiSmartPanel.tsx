/**
 * MidiSmartPanel — diatonic chord suggestions with Tone.js preview.
 */
import { Lock, Unlock } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
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

const SCALES: Scale[] = ["major", "minor", "dorian", "mixolydian", "pentatonic"];

export interface MidiSmartPanelProps {
  root?: RootNote;
  scale?: Scale;
  onInsertChord?: (notes: number[]) => void;
  className?: string;
}

export function MidiSmartPanel({
  root: initialRoot = "C",
  scale: initialScale = "major",
  onInsertChord,
  className,
}: MidiSmartPanelProps) {
  const [root, setRoot] = useState<RootNote>(initialRoot);
  const [scale, setScale] = useState<Scale>(initialScale);
  const [scaleLock, setScaleLock] = useState(true);
  const synthRef = useRef<Tone.PolySynth | null>(null);

  const chords = useMemo(() => getDiatonicChords(root, scale), [root, scale]);

  const previewChord = useCallback(async (midiNotes: number[]) => {
    await Tone.start();
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
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
      onInsertChord?.(midiNotes);
    },
    [previewChord, onInsertChord],
  );

  return (
    <div className={cn("rounded-lg border border-border bg-muted/40 p-sm", className)}>
      <div className="flex items-center justify-between gap-xs">
        <SectionLabel>Smart chords</SectionLabel>
        <button
          type="button"
          onClick={() => setScaleLock((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-xs py-0.5 text-[10px] font-medium",
            scaleLock
              ? "text-primary-300"
              : "text-muted-foreground",
          )}
          title={scaleLock ? "Scale locked" : "Scale unlocked"}
        >
          {scaleLock ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
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
          <button
            key={chord.name}
            type="button"
            onClick={() => handleChordClick(chord.midi)}
            className="rounded-md border border-accent-midi/25 bg-accent-midi/10 px-sm py-xs text-xs font-medium text-accent-midi-200 transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-200"
          >
            {chord.name}
          </button>
        ))}
      </div>
    </div>
  );
}
