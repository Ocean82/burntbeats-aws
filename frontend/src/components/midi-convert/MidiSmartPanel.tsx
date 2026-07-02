import { Lock, Plus, Shuffle, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { previewChordMidiNotes } from "../../audio/audioEngine";
import {
  getDiatonicChords,
  type RootNote,
  type Scale,
  NOTE_NAMES,
  SCALE_INTERVALS,
} from "../../utils/musicTheory";
import {
  generateProgression,
  generateVariation,
  type GeneratedProgression,
} from "../../utils/chordProgressionGenerator";
import { chordToMidi } from "../../utils/midiChordParser";
import { cn } from "../../utils/cn";
import { SectionLabel } from "../ui";

const SCALES: Scale[] = [
  "major",
  "minor",
  "dorian",
  "mixolydian",
  "pentatonic",
];

const MOODS = ["happy", "sad", "energetic", "calm", "mysterious", "romantic", "dramatic", "nostalgic"];

const GENRES = ["pop", "rock", "jazz", "blues", "folk", "electronic", "classical", "reggae", "country", "hiphop"];

export interface MidiSmartPanelProps {
  root?: RootNote;
  scale?: Scale;
  onInsertChord?: (notes: number[]) => void;
  onInsertProgression?: (chords: number[][]) => void;
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
  onInsertProgression,
  onScaleChange,
  scaleLockDisabled = false,
  className,
}: MidiSmartPanelProps) {
  const [root, setRoot] = useState<RootNote>(initialRoot);
  const [scale, setScale] = useState<Scale>(initialScale);
  const [scaleLock, setScaleLock] = useState(() => !scaleLockDisabled);
  const [genre, setGenre] = useState("pop");
  const [mood, setMood] = useState("happy");
  const [progression, setProgression] = useState<GeneratedProgression | null>(null);

  const effectiveScaleLock = scaleLockDisabled ? false : scaleLock;

  const chords = useMemo(() => getDiatonicChords(root, scale), [root, scale]);

  useEffect(() => {
    onScaleChange?.({ root, scale, locked: effectiveScaleLock });
  }, [root, scale, effectiveScaleLock, onScaleChange]);

  const previewChord = useCallback(async (midiNotes: number[]) => {
    await previewChordMidiNotes(midiNotes);
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

  const handleGenerate = useCallback(() => {
    const prog = generateProgression(
      { tonic: root, mode: scale },
      genre,
      mood,
      4,
    );
    setProgression(prog);
  }, [root, scale, genre, mood]);

  const handleInsertProgression = useCallback(() => {
    if (!progression) return;
    const allChords = progression.chords.map((c) =>
      chordToMidi(c.root, c.quality, 4),
    );
    onInsertProgression?.(allChords);
  }, [progression, onInsertProgression]);

  const handleVariation = useCallback(
    (type: "substitute" | "extend" | "invert" | "reharmonize") => {
      if (!progression) return;
      setProgression(generateVariation(progression, type));
    },
    [progression],
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
            effectiveScaleLock ? "text-primary-300" : "text-muted-foreground",
            scaleLockDisabled && "opacity-50 cursor-not-allowed",
          )}
          title={
            scaleLockDisabled
              ? "Scale lock disabled for drum content"
              : effectiveScaleLock
                ? "Scale locked"
                : "Scale unlocked"
          }
          aria-label={
            scaleLockDisabled
              ? "Scale lock unavailable for drum content"
              : effectiveScaleLock
                ? "Unlock scale guide"
                : "Lock scale guide"
          }
        >
          {effectiveScaleLock ? (
            <Lock className="h-3 w-3" aria-hidden />
          ) : (
            <Unlock className="h-3 w-3" aria-hidden />
          )}
          {effectiveScaleLock ? "Locked" : "Free"}
        </button>
      </div>

      <div className="mt-sm flex flex-wrap gap-xs">
        <select
          value={root}
          onChange={(e) => setRoot(e.target.value as RootNote)}
          disabled={effectiveScaleLock}
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
          disabled={effectiveScaleLock}
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

      <hr className="my-sm border-border/50" />

      <div className="space-y-sm">
        <div className="flex items-center justify-between">
          <SectionLabel>Generate progression</SectionLabel>
          <div className="flex items-center gap-1">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]"
              aria-label="Genre"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]"
              aria-label="Mood"
            >
              {MOODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerate}
              className="inline-flex items-center gap-0.5 rounded bg-accent-midi/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-midi-200 hover:bg-accent-midi/30"
              aria-label="Generate progression"
            >
              <Shuffle className="h-2.5 w-2.5" aria-hidden />
              Generate
            </button>
          </div>
        </div>

        {progression && (
          <div className="space-y-1 rounded border border-accent-midi/15 bg-accent-midi/5 p-xs">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                {progression.description} · {progression.tempo} BPM
              </p>
              <div className="flex items-center gap-0.5">
                {(["substitute", "extend", "invert", "reharmonize"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleVariation(v)}
                    className="rounded bg-muted/40 px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-accent-midi/20 hover:text-accent-midi-200"
                    title={`Apply ${v} variation`}
                  >
                    {v}
                  </button>
                ))}
                {onInsertProgression && (
                  <button
                    type="button"
                    onClick={handleInsertProgression}
                    className="rounded bg-accent-midi/20 px-1.5 py-0.5 text-[9px] font-medium text-accent-midi-200 hover:bg-accent-midi/30"
                    title="Insert all chords"
                  >
                    Insert all
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {progression.chords.map((c, i) => {
                const midi = chordToMidi(c.root, c.quality, 4);
                const label = `${c.root}${c.quality === "major" ? "" : c.quality === "minor" ? "m" : c.quality === "dom7" ? "7" : c.quality === "dim" ? "dim" : c.quality === "maj7" ? "maj7" : c.quality === "min7" ? "m7" : ""}`;
                return (
                  <div key={i} className="relative flex">
                    <button
                      type="button"
                      onClick={() => handleChordClick(midi)}
                      onDoubleClick={() => handleChordInsert(midi)}
                      className="min-w-0 rounded border border-accent-midi/20 bg-accent-midi/8 px-1.5 py-0.5 text-[10px] font-medium text-accent-midi-200 transition hover:bg-accent-midi/20"
                      title={`${progression.romanNumerals[i]} — ${label}`}
                    >
                      {progression.romanNumerals[i]}
                      <span className="ml-0.5 opacity-60">{label}</span>
                    </button>
                    {onInsertChord && (
                      <button
                        type="button"
                        onClick={() => handleChordInsert(midi)}
                        className="ml-px inline-flex items-center justify-center rounded border border-border/50 bg-muted/30 px-0.5 text-accent-midi-300 hover:bg-accent-midi/10"
                        aria-label={`Insert ${label}`}
                      >
                        <Plus className="h-2 w-2" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
