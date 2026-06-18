import { useEffect, useMemo, useRef } from "react";
import { useMidiHarmonicAnalysis } from "../../hooks/useMidiHarmonicAnalysis";
import type { EditableNote, TimeSignature } from "./editorTypes";
import { cn } from "../../utils/cn";

interface MidiHarmonyPanelProps {
  notes: EditableNote[];
  bpm: number;
  timeSignature: TimeSignature;
  autoAnalyze?: boolean;
}

const DEBOUNCE_MS = 600;

function notesFingerprint(notes: EditableNote[]): string {
  let s = 0;
  let count = 0;
  for (const n of notes) {
    s = ((s << 5) - s + n.pitch) | 0;
    s = ((s << 5) - s + Math.round(n.start * 100)) | 0;
    s = ((s << 5) - s + Math.round(n.duration * 100)) | 0;
    s = ((s << 5) - s + n.velocity) | 0;
    count++;
  }
  return `${count}_${s}`;
}

export function MidiHarmonyPanel({
  notes,
  bpm,
  timeSignature,
  autoAnalyze = true,
}: MidiHarmonyPanelProps) {
  const tsStr = useMemo(
    () => `${timeSignature.beatsPerBar}/${timeSignature.beatUnit}`,
    [timeSignature],
  );

  const { analyze, result, loading, error, clear } = useMidiHarmonicAnalysis();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFpRef = useRef<string>("");

  useEffect(() => {
    if (!autoAnalyze || notes.length === 0) return;

    const fp = notesFingerprint(notes);
    if (fp === prevFpRef.current) return;
    prevFpRef.current = fp;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const input = notes.map((n) => ({
        pitch: n.pitch,
        start: n.start,
        duration: n.duration,
        velocity: n.velocity,
      }));
      analyze(input, bpm, tsStr);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [autoAnalyze, notes, bpm, tsStr, analyze]);

  useEffect(() => {
    return () => {
      clear();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clear]);

  if (loading) {
    return (
      <div className="midi-inspector">
        <p className="midi-inspector__title">Harmonic analysis</p>
        <p className="text-xs text-[var(--midi-text-muted)] midi-loading-shimmer">Analyzing…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="midi-inspector">
        <p className="midi-inspector__title">Harmonic analysis</p>
        <p className="text-xs text-destructive-300">{error}</p>
      </div>
    );
  }

  if (!result || result.bar_count === 0) {
    return (
      <div className="midi-inspector">
        <p className="midi-inspector__title">Harmonic analysis</p>
        <p className="text-xs text-[var(--midi-text-muted)]">No notes to analyze</p>
      </div>
    );
  }

  return (
    <div className="midi-inspector" data-testid="midi-harmony-panel">
      <p className="midi-inspector__title">Harmonic analysis</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Key
          </dt>
          <dd className="mt-1 inline-flex items-center gap-1 rounded-md border border-accent-midi/20 bg-accent-midi-950/20 px-xs py-0.5 font-mono text-sm font-semibold text-accent-midi-200 midi-key-badge">
            {result.key.replace(/b/g, "\u266D").replace(/#/g, "\u266F")}
            <span className="text-[9px] text-[var(--midi-text-muted)] font-normal">
              {Math.round(result.key_confidence * 100)}%
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mode
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200 capitalize">
            {result.mode}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Bars
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
            {result.bar_count}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Progression
          </dt>
          <dd className="mt-1 font-mono text-xs text-accent-midi-200 truncate" title={result.chord_progression}>
            {result.chord_progression}
          </dd>
        </div>
      </dl>

      {result.bars.length > 0 && (
        <div className="mt-sm max-h-40 overflow-y-auto">
          <p className="midi-inspector__title mb-1 text-[10px]">Per-bar chords</p>
          <div className="flex flex-wrap gap-1">
            {result.bars.map((bar, idx) => (
              <div
                key={bar.bar}
                className={cn(
                  "midi-chord-card flex flex-col items-center gap-0.5 rounded-md border px-2 py-1 min-w-[3rem]",
                  bar.chord !== "\u2014"
                    ? "border-accent-midi/20 bg-accent-midi-950/15"
                    : "border-border/40 bg-muted/20",
                )}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <span className="font-mono text-[10px] font-bold text-accent-midi-200 leading-tight">
                  {bar.chord}
                </span>
                <span className="text-[8px] text-[var(--midi-text-muted)] tabular-nums">
                  {bar.bar}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
