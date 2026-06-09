/**
 * DrumMachinePanel — Production beat maker with 8-row step sequencer,
 * velocity support, swing, mute/solo, variable pattern length, and MIDI export.
 */
import { Download, Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { downloadMidiBlob, exportNotesToMidi } from "../../utils/midiExport";
import { cn } from "../../utils/cn";
import { PanelHeader, SectionLabel } from "../ui";
import { playDrumVoice } from "../../audio/drumSynth";
import { applySwingToNoteStart, getSwungStepTime } from "../../audio/swingQuantize";
import {
  DEFAULT_KIT,
  VELOCITY_ACCENT,
  VELOCITY_GHOST,
  VELOCITY_NORMAL,
  VELOCITY_OFF,
} from "../../audio/types";
import type {
  CellVelocity,
  DrumVoice,
  PatternLength,
  RowState,
  VelocityPattern,
} from "../../audio/types";

// ─── Helpers ──────────────────────────────────────────────────────

function emptyPattern(rows: number, steps: number): VelocityPattern {
  return Array.from({ length: rows }, () => Array(steps).fill(VELOCITY_OFF));
}

function defaultRowStates(count: number): RowState[] {
  return Array.from({ length: count }, () => ({
    muted: false,
    solo: false,
    volume: 0.8,
  }));
}

/** Cycle velocity: off → normal → accent → ghost → off */
function cycleVelocity(current: CellVelocity): CellVelocity {
  if (current === VELOCITY_OFF) return VELOCITY_NORMAL;
  if (current === VELOCITY_NORMAL) return VELOCITY_ACCENT;
  if (current === VELOCITY_ACCENT) return VELOCITY_GHOST;
  return VELOCITY_OFF;
}

/** Map velocity to a visual opacity for the cell. */
function velocityOpacity(vel: CellVelocity): string {
  if (vel === VELOCITY_OFF) return "";
  if (vel <= VELOCITY_GHOST) return "opacity-40";
  if (vel <= VELOCITY_NORMAL) return "opacity-75";
  return "opacity-100";
}

/** Determine which rows should be audible given mute/solo state. */
function getAudibleRows(rowStates: RowState[]): boolean[] {
  const anySolo = rowStates.some((r) => r.solo);
  return rowStates.map((r) => {
    if (anySolo) return r.solo && !r.muted;
    return !r.muted;
  });
}

// ─── Component ────────────────────────────────────────────────────

export interface DrumMachinePanelProps {
  embedded?: boolean;
}

export function DrumMachinePanel({ embedded = false }: DrumMachinePanelProps) {
  const kit: DrumVoice[] = DEFAULT_KIT;
  const rowCount = kit.length;

  // Pattern state
  const [steps, setSteps] = useState<PatternLength>(16);
  const [pattern, setPattern] = useState<VelocityPattern>(() => emptyPattern(rowCount, 16));
  const [rowStates, setRowStates] = useState<RowState[]>(() => defaultRowStates(rowCount));

  // Transport state
  const [bpm, setBpm] = useState(120);
  const [swing, setSwing] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepIndexRef = useRef(0);

  // Keep pattern ref in sync for the scheduler closure
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const rowStatesRef = useRef(rowStates);
  rowStatesRef.current = rowStates;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const swingRef = useRef(swing);
  swingRef.current = swing;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // ─── Pattern Length Resize ────────────────────────────────────

  const handleStepsChange = useCallback(
    (newSteps: PatternLength) => {
      setPattern((prev) => {
        return prev.map((row) => {
          if (newSteps <= row.length) return row.slice(0, newSteps);
          return [...row, ...Array(newSteps - row.length).fill(VELOCITY_OFF)];
        });
      });
      setSteps(newSteps);
    },
    [],
  );

  // ─── Cell Interaction ─────────────────────────────────────────

  const toggleCell = useCallback((row: number, col: number) => {
    setPattern((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = cycleVelocity(next[row][col]);
      return next;
    });
  }, []);

  const clearCell = useCallback((row: number, col: number) => {
    setPattern((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = VELOCITY_OFF;
      return next;
    });
  }, []);

  // ─── Mute/Solo ────────────────────────────────────────────────

  const toggleMute = useCallback((row: number) => {
    setRowStates((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], muted: !next[row].muted };
      return next;
    });
  }, []);

  const toggleSolo = useCallback((row: number) => {
    setRowStates((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], solo: !next[row].solo };
      return next;
    });
  }, []);

  // ─── Clear Pattern ────────────────────────────────────────────

  const clearPattern = useCallback(() => {
    setPattern(emptyPattern(rowCount, steps));
  }, [rowCount, steps]);

  // ─── Playback Engine ──────────────────────────────────────────

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    setCurrentStep(-1);
    stepIndexRef.current = 0;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const scheduleStep = useCallback((ctx: AudioContext) => {
    const pat = patternRef.current;
    const rs = rowStatesRef.current;
    const currentBpm = bpmRef.current;
    const currentSwing = swingRef.current;
    const totalSteps = stepsRef.current;
    const stepDuration = 60 / currentBpm / 4;
    const audible = getAudibleRows(rs);

    // Look-ahead scheduling: schedule notes slightly ahead of time
    const lookAhead = 0.05; // 50ms
    const scheduleInterval = 25; // check every 25ms

    const scheduler = () => {
      while (nextStepTimeRef.current < ctx.currentTime + lookAhead) {
        const stepIdx = stepIndexRef.current % totalSteps;
        const stepTime = nextStepTimeRef.current;

        // Play audible hits at this step
        pat.forEach((row, ri) => {
          if (audible[ri] && row[stepIdx] > VELOCITY_OFF) {
            const vel = Math.round(row[stepIdx] * rs[ri].volume);
            playDrumVoice(ctx, kit[ri].id, stepTime, vel, ctx.destination);
          }
        });

        // Update UI step (use setTimeout to avoid blocking)
        const displayStep = stepIdx;
        setTimeout(() => setCurrentStep(displayStep), 0);

        // Advance to next step with swing
        const nextIdx = (stepIdx + 1) % totalSteps;
        const currentStepTime = getSwungStepTime(stepIdx, stepDuration, currentSwing);
        const nextStepTime = getSwungStepTime(nextIdx, stepDuration, currentSwing);

        // If we wrapped around, add one full pattern duration
        if (nextIdx === 0) {
          nextStepTimeRef.current += totalSteps * stepDuration - currentStepTime;
        } else {
          nextStepTimeRef.current += nextStepTime - currentStepTime;
        }

        stepIndexRef.current = nextIdx;
      }

      timerRef.current = window.setTimeout(scheduler, scheduleInterval) as unknown as number;
    };

    scheduler();
  }, [kit]);

  const start = useCallback(() => {
    stop();
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    stepIndexRef.current = 0;
    nextStepTimeRef.current = ctx.currentTime + 0.05;
    setPlaying(true);
    scheduleStep(ctx);
  }, [stop, scheduleStep]);

  // ─── MIDI Export ──────────────────────────────────────────────

  const exportMidi = useCallback(() => {
    const notes: MidiNoteEvent[] = [];
    const audible = getAudibleRows(rowStates);

    pattern.forEach((row, ri) => {
      if (!audible[ri]) return;
      row.forEach((vel, stepIdx) => {
        if (vel === VELOCITY_OFF) return;
        const startTime = applySwingToNoteStart(stepIdx, bpm, swing);
        const stepDur = 60 / bpm / 4;
        notes.push({
          pitch: kit[ri].pitch,
          start: startTime,
          duration: stepDur * 0.8,
          velocity: Math.round(vel * rowStates[ri].volume),
        });
      });
    });

    const blob = exportNotesToMidi(notes, bpm, "Drum Pattern");
    downloadMidiBlob(blob, "drum-pattern.mid");
  }, [pattern, bpm, swing, rowStates, kit]);

  // ─── Computed ─────────────────────────────────────────────────

  const audibleRows = useMemo(() => getAudibleRows(rowStates), [rowStates]);

  const gridCols = `grid-cols-[80px_repeat(${steps},minmax(24px,1fr))]`;

  // ─── Render ───────────────────────────────────────────────────

  const body = (
    <div className="p-md space-y-sm">
      {/* Transport bar */}
      <div className="flex flex-wrap items-center gap-sm">
        <SectionLabel>Transport</SectionLabel>

        <button
          type="button"
          onClick={() => (playing ? stop() : start())}
          className="midi-btn text-xs"
          aria-label={playing ? "Stop playback" : "Start playback"}
        >
          {playing ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {playing ? "Stop" : "Play"}
        </button>

        {/* BPM */}
        <label className="flex items-center gap-xs text-xs text-muted-foreground">
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) =>
              setBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))
            }
            className="w-14 rounded border border-border bg-muted px-xs py-0.5 text-xs tabular-nums"
          />
        </label>

        {/* Swing */}
        <label className="flex items-center gap-xs text-xs text-muted-foreground">
          Swing
          <input
            type="range"
            min={0}
            max={80}
            value={swing}
            onChange={(e) => setSwing(Number(e.target.value))}
            className="w-16 accent-primary-400"
          />
          <span className="w-7 tabular-nums text-right">{swing}%</span>
        </label>

        {/* Steps */}
        <label className="flex items-center gap-xs text-xs text-muted-foreground">
          Steps
          <select
            value={steps}
            onChange={(e) => handleStepsChange(Number(e.target.value) as PatternLength)}
            className="rounded border border-border bg-muted px-xs py-0.5 text-xs"
          >
            <option value={16}>16</option>
            <option value={32}>32</option>
            <option value={64}>64</option>
          </select>
        </label>

        {/* Clear */}
        <button
          type="button"
          onClick={clearPattern}
          className="midi-btn text-xs text-muted-foreground"
          aria-label="Clear pattern"
        >
          Clear
        </button>

        {/* Export */}
        <button
          type="button"
          onClick={exportMidi}
          className="midi-btn text-xs ml-auto"
        >
          <Download className="h-3.5 w-3.5" />
          Export MIDI
        </button>
      </div>

      {/* Sequencer grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Step numbers header */}
          <div className={cn("mb-0.5 grid gap-0.5", gridCols)}>
            <div /> {/* spacer for row labels */}
            {Array.from({ length: steps }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "text-center text-[9px] tabular-nums select-none",
                  i % 4 === 0 ? "text-primary-300 font-medium" : "text-muted-foreground",
                  i % 16 === 0 && i > 0 && "border-l border-border",
                )}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Instrument rows */}
          {kit.map((voice, ri) => (
            <div
              key={voice.id}
              className={cn("mb-0.5 grid gap-0.5", gridCols)}
            >
              {/* Row label + controls */}
              <div className="flex items-center gap-0.5 pr-1">
                {/* Mute */}
                <button
                  type="button"
                  onClick={() => toggleMute(ri)}
                  className={cn(
                    "h-5 w-5 rounded-sm flex items-center justify-center text-[8px] font-bold transition",
                    rowStates[ri].muted
                      ? "bg-error/20 text-error"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  aria-label={`${rowStates[ri].muted ? "Unmute" : "Mute"} ${voice.label}`}
                  title="Mute"
                >
                  M
                </button>
                {/* Solo */}
                <button
                  type="button"
                  onClick={() => toggleSolo(ri)}
                  className={cn(
                    "h-5 w-5 rounded-sm flex items-center justify-center text-[8px] font-bold transition",
                    rowStates[ri].solo
                      ? "bg-warning/20 text-warning"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  aria-label={`${rowStates[ri].solo ? "Unsolo" : "Solo"} ${voice.label}`}
                  title="Solo"
                >
                  S
                </button>
                {/* Label */}
                <span
                  className={cn(
                    "text-[10px] font-medium truncate min-w-0",
                    !audibleRows[ri] ? "text-muted-foreground line-through" : "text-accent-midi-200",
                  )}
                  title={voice.label}
                >
                  {voice.shortLabel}
                </span>
              </div>

              {/* Step cells */}
              {pattern[ri].map((vel, ci) => {
                const isActive = vel > VELOCITY_OFF;
                const isCurrent = playing && currentStep === ci;
                const isDownbeat = ci % 4 === 0;
                const isBarStart = ci % 16 === 0 && ci > 0;

                return (
                  <button
                    key={ci}
                    type="button"
                    onClick={() => toggleCell(ri, ci)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      clearCell(ri, ci);
                    }}
                    className={cn(
                      "aspect-square rounded-sm border transition-colors duration-75 min-h-[24px]",
                      isActive
                        ? cn(
                            "border-primary-400/60 bg-primary-500/50",
                            velocityOpacity(vel),
                          )
                        : cn(
                            "hover:bg-muted",
                            isDownbeat
                              ? "border-border/80 bg-muted/40"
                              : "border-border/50 bg-muted/20",
                          ),
                      isCurrent && "ring-1 ring-warning-400/70 ring-inset",
                      isBarStart && "ml-0.5",
                    )}
                    aria-label={`${voice.label} step ${ci + 1}${isActive ? ` velocity ${vel}` : ""}`}
                    aria-pressed={isActive}
                  />
                );
              })}
            </div>
          ))}

          {/* Velocity legend */}
          <div className="mt-sm flex items-center gap-sm text-[9px] text-muted-foreground">
            <span>Click: cycle velocity</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary-400/60 bg-primary-500/50 opacity-40" />
              Ghost
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary-400/60 bg-primary-500/50 opacity-75" />
              Normal
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary-400/60 bg-primary-500/50 opacity-100" />
              Accent
            </span>
            <span className="ml-auto">Right-click: clear</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div data-testid="drum-machine-panel">
        {body}
      </div>
    );
  }

  return (
    <div className="ui-panel overflow-hidden" data-testid="drum-machine-panel">
      <PanelHeader
        title="Drum Machine"
        subtitle={`${steps}-step pattern sequencer · ${kit.length} instruments`}
      />
      {body}
    </div>
  );
}
