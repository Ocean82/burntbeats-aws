/**
 * DrumMachinePanel — Production beat maker with 8-row step sequencer,
 * velocity support, swing, mute/solo, variable pattern length, and MIDI export.
 *
 * State is owned by the `useBeatMaker` hook, making it possible for external
 * controllers (preset bar, save/load dialogs) to share the same state.
 *
 * The master bus provides a shared AudioContext with grid and overlay gain nodes
 * routed through a compressor. The overlay transport synchronizes with the main
 * beat maker transport for layered playback.
 */
import { Download, Lock, Music2, Play, Square } from "lucide-react";
import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { downloadMidiBlob, exportNotesToMidi } from "../../utils/midiExport";
import { cn } from "../../utils/cn";
import { PanelHeader, SectionLabel } from "../ui";
import { patternToMidiNotes } from "../../audio/beatPatternExport";
import {
  VELOCITY_OFF,
  type CellVelocity,
  type PatternLength,
} from "../../audio/types";
import { useBeatMaker, getAudibleRows } from "../../hooks/useBeatMaker";
import type { UseBeatMakerReturn } from "../../hooks/useBeatMaker";
import type { UseBeatMakerGridFocusReturn } from "../../hooks/useBeatMakerGridFocus";
import { useMasterBus, type UseMasterBusReturn } from "../../hooks/useMasterBus";
import { useOverlayTransport } from "../../hooks/useOverlayTransport";
import { saveBeatHandoff } from "../../utils/beatToMidiHandoff";
import { PatternLibraryPanel } from "./PatternLibraryPanel";
import { MasterBusControls } from "./MasterBusControls";
import { KitSelector } from "./KitSelector";

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
  /** Shared master bus instance (avoids duplicate AudioContexts when beatMaker is external). */
  masterBus?: UseMasterBusReturn;
  /** Whether full MIDI export is allowed (false = limited to 16 steps). */
  canExportFullMidi?: boolean;
  /** Whether variation generators are unlocked. */
  canUseVariations?: boolean;
  /** Callback when user hits the export gate. */
  onExportGated?: () => void;
  /** Callback when user hits a variation entitlement gate. */
  onVariationGated?: () => void;
  /** Keyboard navigation focus (optional). */
  gridFocus?: UseBeatMakerGridFocusReturn;
  /** Respect reduced-motion preference for cell/playhead animation. */
  reduceMotion?: boolean;
}

export function DrumMachinePanel({
  embedded = false,
  beatMaker: externalBeatMaker,
  masterBus: externalMasterBus,
  canExportFullMidi = true,
  canUseVariations = true,
  onExportGated,
  onVariationGated,
  gridFocus,
  reduceMotion = false,
}: DrumMachinePanelProps) {
  const [, navigate] = useLocation();
  // ─── Master Bus ─────────────────────────────────────────────────
  // Provides shared AudioContext, grid and overlay gain nodes routed
  // through a compressor to the destination.
  const internalMasterBus = useMasterBus();
  const masterBus = externalMasterBus ?? internalMasterBus;

  // Use external hook instance if provided, otherwise create internal one
  // connected to the master bus grid gain node via stable getters.
  const internalBeatMaker = useBeatMaker({
    getAudioContext: masterBus.getAudioContext,
    getOutputNode: masterBus.getGridGainNode,
  });
  const bm = externalBeatMaker ?? internalBeatMaker;

  const {
    kit,
    kitId,
    setKit,
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
    setRowVolume,
    setBpm,
    setSwing,
    metronomeEnabled,
    setMetronomeEnabled,
    start,
    stop,
  } = bm;

  // ─── Overlay Transport ──────────────────────────────────────────
  // Synchronized with the main beat maker transport, routes audio
  // through the overlay gain node.
  const overlayTransport = useOverlayTransport(
    masterBus.audioContext,
    playing,
    bpm,
    swing,
    masterBus.overlayGainNode,
  );

  // ─── Transport Start/Stop Override ──────────────────────────────
  // Ensure master bus AudioContext is initialized on first play.
  const handlePlayStop = useCallback(() => {
    if (playing) {
      stop();
    } else {
      // Initialize audio context on first user interaction (browser policy)
      masterBus.initAudio();
      start();
    }
  }, [playing, stop, start, masterBus]);

  // ─── MIDI Export ──────────────────────────────────────────────

  const exportMidi = useCallback(() => {
    if (!canExportFullMidi && steps > 16) {
      onExportGated?.();
      return;
    }

    const notes = patternToMidiNotes({
      pattern,
      rowStates,
      kit,
      bpm,
      swing,
      steps,
      canExportFullMidi,
    });

    const blob = exportNotesToMidi(notes, bpm, "Drum Pattern");
    downloadMidiBlob(blob, "drum-pattern.mid");
  }, [pattern, bpm, swing, rowStates, kit, steps, canExportFullMidi, onExportGated]);

  const openInPianoRoll = useCallback(() => {
    if (!canExportFullMidi && steps > 16) {
      onExportGated?.();
      return;
    }
    const notes = patternToMidiNotes({
      pattern,
      rowStates,
      kit,
      bpm,
      swing,
      steps,
      canExportFullMidi,
    });
    saveBeatHandoff({ notes, bpm, name: "Drum Pattern" });
    navigate("/midi?beat-handoff=1");
  }, [
    pattern,
    rowStates,
    kit,
    bpm,
    swing,
    steps,
    canExportFullMidi,
    onExportGated,
    navigate,
  ]);

  // ─── Computed ─────────────────────────────────────────────────

  const audibleRows = useMemo(() => getAudibleRows(rowStates), [rowStates]);

  const sequencerGridStyle = {
    "--sequencer-cols": `96px repeat(${steps}, minmax(24px, 1fr))`,
  } as React.CSSProperties;

  // ─── Render ───────────────────────────────────────────────────

  const body = (
    <div className="p-md space-y-sm">
      {/* Transport bar */}
      <div className="flex flex-wrap items-center gap-sm">
        <SectionLabel>Transport</SectionLabel>

        <button
          type="button"
          onClick={handlePlayStop}
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

        <button
          type="button"
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          className={cn(
            "midi-btn text-xs midi-physical-btn--metronome",
            metronomeEnabled && "ring-1 ring-warning-400/60",
          )}
          aria-pressed={metronomeEnabled}
          aria-label="Toggle metronome"
          title="Metronome click on downbeats"
        >
          Metro
        </button>

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

        {/* Kit selector */}
        <KitSelector value={kitId} onChange={setKit} />

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
          onClick={openInPianoRoll}
          className="midi-btn text-xs"
          title="Open pattern in the MIDI piano roll editor"
          data-testid="beat-edit-piano-roll"
        >
          <Music2 className="h-3.5 w-3.5" />
          Edit in piano roll
        </button>

        <button
          type="button"
          onClick={exportMidi}
          className={cn("midi-btn text-xs", !canExportFullMidi && steps > 16 && "opacity-60")}
          title={!canExportFullMidi && steps > 16 ? "Upgrade to export patterns longer than 16 steps" : "Export as MIDI file"}
        >
          <Download className="h-3.5 w-3.5" />
          Export MIDI
          {!canExportFullMidi && steps > 16 && (
            <Lock className="ml-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden />
          )}
        </button>
      </div>

      {/* Master Bus Controls — near transport */}
      <MasterBusControls
        gridVolume={masterBus.gridVolume}
        overlayVolume={masterBus.overlayVolume}
        onGridVolumeChange={masterBus.setGridVolume}
        onOverlayVolumeChange={masterBus.setOverlayVolume}
      />

      {/* Sequencer grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Step numbers header */}
          <div className="mb-0.5 sequencer-grid gap-0.5" style={sequencerGridStyle}>
            <div /> {/* spacer for row labels */}
            {Array.from({ length: steps }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "text-center text-[9px] tabular-nums select-none",
                  i % 4 === 0
                    ? "text-accent-midi-200 font-semibold"
                    : "text-muted-foreground",
                  i % 16 === 0 && i > 0 && "border-l-2 border-accent-midi-400/40",
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
              className="mb-0.5 sequencer-grid gap-0.5"
              style={sequencerGridStyle}
            >
              {/* Row label + controls */}
              <div className="flex flex-col gap-0.5 pr-1 min-w-0">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleMute(ri)}
                    className={cn(
                      "relative flex h-5 w-5 items-center justify-center rounded-sm text-[8px] font-bold transition before:absolute before:-inset-2.5 before:content-['']",
                      rowStates[ri].muted
                        ? "bg-error/20 text-error"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-label={`${rowStates[ri].muted ? "Unmute" : "Mute"} ${voice.label}`}
                    title="Mute"
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSolo(ri)}
                    className={cn(
                      "relative flex h-5 w-5 items-center justify-center rounded-sm text-[8px] font-bold transition before:absolute before:-inset-2.5 before:content-['']",
                      rowStates[ri].solo
                        ? "bg-warning/20 text-warning"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-label={`${rowStates[ri].solo ? "Unsolo" : "Solo"} ${voice.label}`}
                    title="Solo"
                  >
                    S
                  </button>
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
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={rowStates[ri].volume}
                  onChange={(e) => setRowVolume(ri, Number(e.target.value))}
                  disabled={!audibleRows[ri]}
                  className="h-1 w-full min-w-0 accent-primary-400 disabled:opacity-40"
                  aria-label={`${voice.label} volume`}
                />
              </div>

              {/* Step cells */}
              {pattern[ri].map((vel, ci) => {
                const isActive = vel > VELOCITY_OFF;
                const isCurrent = playing && currentStep === ci;
                const isDownbeat = ci % 4 === 0;
                const isBarStart = ci % 16 === 0 && ci > 0;
                const isFocused =
                  gridFocus?.focus.row === ri && gridFocus?.focus.step === ci;

                const cellClassName = cn(
                  "relative aspect-square min-h-[28px] rounded-sm border transition-colors duration-75 before:absolute before:-inset-1 before:content-['']",
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
                  isCurrent && "beat-playhead-cell ring-2 ring-warning-400/80 ring-inset",
                  isFocused && "outline outline-1 outline-accent-midi-300/70 -outline-offset-1",
                  isBarStart && "ml-0.5",
                );

                const cellButton = (
                  <button
                    type="button"
                    data-testid={`beat-grid-cell-${ri}-${ci}`}
                    onClick={() => toggleCell(ri, ci)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      clearCell(ri, ci);
                    }}
                    className={cellClassName}
                    aria-label={`${voice.label} step ${ci + 1}${isActive ? ` velocity ${vel}` : ""}`}
                    aria-pressed={isActive}
                  />
                );

                if (!reduceMotion && isCurrent) {
                  return (
                    <motion.div
                      key={ci}
                      className="relative"
                      initial={{ scale: 0.92 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.08, ease: "easeOut" }}
                    >
                      {cellButton}
                    </motion.div>
                  );
                }

                return <div key={ci}>{cellButton}</div>;
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

      {/* Pattern Library Panel — overlay pattern selection and variation controls */}
      <PatternLibraryPanel
        onPatternSelect={overlayTransport.selectPattern}
        activePatternId={overlayTransport.activePattern?.id ?? null}
        onVariationApply={overlayTransport.applyVariation}
        activeVariation={overlayTransport.activeVariation}
        canUseVariations={canUseVariations}
        onUpgradeRequest={onVariationGated}
      />
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
