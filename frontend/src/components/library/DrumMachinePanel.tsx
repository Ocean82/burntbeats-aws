/**
 * DrumMachinePanel — Production beat maker with 8-row step sequencer,
 * velocity support, swing, mute/solo, variable pattern length, and MIDI export.
 *
 * State is owned by the `useBeatMaker` hook, making it possible for external
 * controllers (preset bar, save/load dialogs) to share the same state.
 */
import { Download, Play, Square } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { downloadMidiBlob, exportNotesToMidi } from "../../utils/midiExport";
import { cn } from "../../utils/cn";
import { PanelHeader, SectionLabel } from "../ui";
import { applySwingToNoteStart } from "../../audio/swingQuantize";
import { VELOCITY_OFF } from "../../audio/types";
import type { CellVelocity, PatternLength } from "../../audio/types";
import { useBeatMaker, getAudibleRows } from "../../hooks/useBeatMaker";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";

// ─── Helpers ──────────────────────────────────────────────────────

/** Map velocity to a visual opacity for the cell. */
function velocityOpacity(vel: CellVelocity): string {
  if (vel === VELOCITY_OFF) return "";
  if (vel <= 40) return "opacity-40";
  if (vel <= 100) return "opacity-75";
  return "opacity-100";
}

// ─── Component ────────────────────────────────────────────────────

export interface DrumMachinePanelProps {
  embedded?: boolean;
  /** Optionally pass in an external beat maker instance (for shared state). */
  beatMaker?: UseBeatMakerReturn;
}

export function DrumMachinePanel({
  embedded = false,
  beatMaker: externalBeatMaker,
}: DrumMachinePanelProps) {
  // Use external hook instance if provided, otherwise create internal one
  const internalBeatMaker = useBeatMaker();
  const bm = externalBeatMaker ?? internalBeatMaker;

  const {
    kit,
    pattern,
    steps,
    rowStates,
    bpm,
    swing,
    playing,
    currentStep,
    toggleCell,
    clearCell,
    setSteps,
    clearPattern,
    toggleMute,
    toggleSolo,
    setBpm,
    setSwing,
    start,
    stop,
  } = bm;

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
            onChange={(e) =>
              setSteps(Number(e.target.value) as PatternLength)
            }
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
                  i % 4 === 0
                    ? "text-primary-300 font-medium"
                    : "text-muted-foreground",
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
                    !audibleRows[ri]
                      ? "text-muted-foreground line-through"
                      : "text-accent-midi-200",
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
    return <div data-testid="drum-machine-panel">{body}</div>;
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
