/**
 * useBeatMaker — Shared state hook for the beat maker.
 *
 * Owns all pattern, transport, and row state. Consumed by the DrumMachinePanel
 * (grid + playback) and by external controllers like preset selectors and
 * save/load dialogs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { playDrumVoice } from "../audio/drumSynth";
import { getSwungStepTime } from "../audio/swingQuantize";
import {
  DEFAULT_KIT,
  VELOCITY_ACCENT,
  VELOCITY_GHOST,
  VELOCITY_NORMAL,
  VELOCITY_OFF,
} from "../audio/types";
import type {
  CellVelocity,
  DrumVoice,
  PatternLength,
  RowState,
  VelocityPattern,
} from "../audio/types";

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

/** Determine which rows should be audible given mute/solo state. */
export function getAudibleRows(rowStates: RowState[]): boolean[] {
  const anySolo = rowStates.some((r) => r.solo);
  return rowStates.map((r) => {
    if (anySolo) return r.solo && !r.muted;
    return !r.muted;
  });
}

// ─── Preset Loading Shape ─────────────────────────────────────────

/** Data needed to fully describe a loadable pattern/preset. */
export interface BeatPreset {
  /** Display name */
  name: string;
  /** Pattern data: rows × steps of velocity values */
  pattern: VelocityPattern;
  /** BPM to set on load */
  bpm: number;
  /** Swing percent (0-80) */
  swing?: number;
  /** Number of steps (must match pattern[0].length) */
  steps: PatternLength;
  /** Optional row states (mute/solo/volume) */
  rowStates?: RowState[];
}

// ─── Return Type ──────────────────────────────────────────────────

export interface UseBeatMakerReturn {
  // Kit
  kit: DrumVoice[];

  // Pattern state
  pattern: VelocityPattern;
  steps: PatternLength;
  rowStates: RowState[];
  bpm: number;
  swing: number;

  // Transport state
  playing: boolean;
  currentStep: number;

  // Pattern mutations
  toggleCell: (row: number, col: number) => void;
  clearCell: (row: number, col: number) => void;
  setSteps: (steps: PatternLength) => void;
  clearPattern: () => void;
  loadPreset: (preset: BeatPreset) => void;
  setPattern: (pattern: VelocityPattern) => void;

  // Row mutations
  toggleMute: (row: number) => void;
  toggleSolo: (row: number) => void;

  // Transport mutations
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  start: () => void;
  stop: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useBeatMaker(): UseBeatMakerReturn {
  const kit = DEFAULT_KIT;
  const rowCount = kit.length;

  // Pattern state
  const [steps, setStepsState] = useState<PatternLength>(16);
  const [pattern, setPattern] = useState<VelocityPattern>(() =>
    emptyPattern(rowCount, 16),
  );
  const [rowStates, setRowStates] = useState<RowState[]>(() =>
    defaultRowStates(rowCount),
  );

  // Transport state
  const [bpm, setBpmState] = useState(120);
  const [swing, setSwingState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepIndexRef = useRef(0);

  // Keep refs in sync for the scheduler closure
  const patternRef = useRef(pattern);
  const rowStatesRef = useRef(rowStates);
  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  const stepsRef = useRef(steps);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    rowStatesRef.current = rowStates;
  }, [rowStates]);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    swingRef.current = swing;
  }, [swing]);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // ─── Pattern Length Resize ────────────────────────────────────

  const setSteps = useCallback(
    (newSteps: PatternLength) => {
      setPattern((prev) =>
        prev.map((row) => {
          if (newSteps <= row.length) return row.slice(0, newSteps);
          return [...row, ...Array(newSteps - row.length).fill(VELOCITY_OFF)];
        }),
      );
      setStepsState(newSteps);
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
    setPattern(emptyPattern(rowCount, stepsRef.current));
    setRowStates(defaultRowStates(rowCount));
  }, [rowCount]);

  // ─── Load Preset ──────────────────────────────────────────────

  const loadPreset = useCallback(
    (preset: BeatPreset) => {
      // Stop playback if running
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        setPlaying(false);
        setCurrentStep(-1);
        stepIndexRef.current = 0;
      }

      // Validate and apply pattern dimensions
      const targetSteps = preset.steps;
      setStepsState(targetSteps);

      // Apply pattern — ensure it has the right number of rows
      const newPattern: VelocityPattern = Array.from(
        { length: rowCount },
        (_, ri) => {
          if (ri < preset.pattern.length) {
            const row = preset.pattern[ri];
            // Ensure correct step count
            if (row.length === targetSteps) return [...row];
            if (row.length > targetSteps) return row.slice(0, targetSteps);
            return [...row, ...Array(targetSteps - row.length).fill(VELOCITY_OFF)];
          }
          return Array(targetSteps).fill(VELOCITY_OFF);
        },
      );
      setPattern(newPattern);

      // Apply transport settings
      setBpmState(Math.max(40, Math.min(240, preset.bpm)));
      setSwingState(Math.max(0, Math.min(80, preset.swing ?? 0)));

      // Apply row states if provided
      if (preset.rowStates) {
        setRowStates(
          Array.from({ length: rowCount }, (_, ri) =>
            ri < preset.rowStates!.length
              ? { ...preset.rowStates![ri] }
              : { muted: false, solo: false, volume: 0.8 },
          ),
        );
      } else {
        setRowStates(defaultRowStates(rowCount));
      }
    },
    [rowCount],
  );

  // ─── Transport: BPM & Swing setters ───────────────────────────

  const setBpm = useCallback((value: number) => {
    setBpmState(Math.max(40, Math.min(240, value)));
  }, []);

  const setSwing = useCallback((value: number) => {
    setSwingState(Math.max(0, Math.min(80, value)));
  }, []);

  // ─── Playback Engine ──────────────────────────────────────────

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    setCurrentStep(-1);
    stepIndexRef.current = 0;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const scheduleStep = useCallback(
    (ctx: AudioContext) => {
      const lookAhead = 0.05; // 50ms
      const scheduleInterval = 25; // check every 25ms

      const scheduler = () => {
        const pat = patternRef.current;
        const rs = rowStatesRef.current;
        const currentBpm = bpmRef.current;
        const currentSwing = swingRef.current;
        const totalSteps = stepsRef.current;
        const stepDuration = 60 / currentBpm / 4;
        const audible = getAudibleRows(rs);

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

          // Update UI step
          const displayStep = stepIdx;
          setTimeout(() => setCurrentStep(displayStep), 0);

          // Advance to next step with swing
          const nextIdx = (stepIdx + 1) % totalSteps;
          const currentStepTime = getSwungStepTime(
            stepIdx,
            stepDuration,
            currentSwing,
          );
          const nextStepTime = getSwungStepTime(
            nextIdx,
            stepDuration,
            currentSwing,
          );

          // If we wrapped around, add one full pattern duration
          if (nextIdx === 0) {
            nextStepTimeRef.current +=
              totalSteps * stepDuration - currentStepTime;
          } else {
            nextStepTimeRef.current += nextStepTime - currentStepTime;
          }

          stepIndexRef.current = nextIdx;
        }

        timerRef.current = window.setTimeout(
          scheduler,
          scheduleInterval,
        ) as unknown as number;
      };

      scheduler();
    },
    [kit],
  );

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

  // ─── Return ───────────────────────────────────────────────────

  return {
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
    loadPreset,
    setPattern,
    toggleMute,
    toggleSolo,
    setBpm,
    setSwing,
    start,
    stop,
  };
}
