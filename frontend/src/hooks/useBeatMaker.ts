/**
 * useBeatMaker — Shared state hook for the beat maker.
 *
 * Owns all pattern, transport, and row state. Consumed by the DrumMachinePanel
 * (grid + playback) and by external controllers like preset selectors and
 * save/load dialogs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE INDEPENDENCE GUARANTEE (Requirements 7.1–7.5)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This hook is a fully independent state machine from `useOverlayTransport`.
 * It does NOT import, reference, or interact with any overlay state. Grid
 * operations (toggleCell, clearCell, setSteps, clearPattern, loadPreset) have
 * ZERO effect on the overlay pattern, variation, or playback position.
 *
 * Shared values (playing, bpm, swing) are passed READ-ONLY to the overlay
 * transport by the parent component — they are never mutated by the overlay.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playDrumVoice, playMetronomeClick } from "../audio/drumSynth";
import {
  createDrumSchedulerNode,
  ensureDrumSchedulerWorklet,
} from "../audio/drumSchedulerWorklet";
import { getSwungStepTime } from "../audio/swingQuantize";
import {
  DEFAULT_KIT,
  KIT_DEFINITIONS,
  VELOCITY_ACCENT,
  VELOCITY_GHOST,
  VELOCITY_NORMAL,
  VELOCITY_OFF,
} from "../audio/types";
import type {
  CellVelocity,
  DrumVoice,
  KitId,
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

function buildStepDurations(
  totalSteps: number,
  bpm: number,
  swing: number,
): number[] {
  const stepDuration = 60 / bpm / 4;
  const durations: number[] = [];
  for (let i = 0; i < totalSteps; i++) {
    const nextIdx = (i + 1) % totalSteps;
    const currentTime = getSwungStepTime(i, stepDuration, swing);
    const nextTime = getSwungStepTime(nextIdx, stepDuration, swing);
    if (nextIdx === 0) {
      durations.push(totalSteps * stepDuration - currentTime);
    } else {
      durations.push(nextTime - currentTime);
    }
  }
  return durations;
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
  kitId: KitId;
  setKit: (id: KitId) => void;

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
  setRowVolume: (row: number, volume: number) => void;

  // Transport mutations
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  metronomeEnabled: boolean;
  setMetronomeEnabled: (enabled: boolean) => void;
  start: () => void;
  stop: () => void;
}

// ─── Hook Options ─────────────────────────────────────────────────

export interface UseBeatMakerOptions {
  /** Getter for external AudioContext to reuse (e.g. from master bus).
   *  Called at start time so it always gets the current value. */
  getAudioContext?: () => AudioContext | null;
  /** Getter for output node for audio routing (e.g. gridGainNode from master bus).
   *  Called at start time so it always gets the current value.
   *  Falls back to ctx.destination when not provided or returns null. */
  getOutputNode?: () => AudioNode | null;
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useBeatMaker(options?: UseBeatMakerOptions): UseBeatMakerReturn {
  const kit = DEFAULT_KIT;
  const rowCount = kit.length;

  const [kitId, setKitIdState] = useState<KitId>("default");

  const setKit = useCallback((id: KitId) => {
    setKitIdState(id);
  }, []);

  const kitParams = useMemo(() => {
    const def = KIT_DEFINITIONS.find((k) => k.id === kitId);
    return def?.params as Record<string, Record<string, number>> | undefined;
  }, [kitId]);

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
  const [metronomeEnabled, setMetronomeEnabledState] = useState(false);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepIndexRef = useRef(0);
  const metronomeEnabledRef = useRef(false);

  // Keep refs in sync for the scheduler closure
  const patternRef = useRef(pattern);
  const rowStatesRef = useRef(rowStates);
  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  const stepsRef = useRef(steps);
  const kitParamsRef = useRef(kitParams);
  useEffect(() => {
    kitParamsRef.current = kitParams;
  }, [kitParams]);

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
  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
  }, [metronomeEnabled]);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    setMetronomeEnabledState(enabled);
  }, []);

  const haltPlayback = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: "stop" });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    setPlaying(false);
    setCurrentStep(-1);
    stepIndexRef.current = 0;
  }, []);

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

  const setRowVolume = useCallback((row: number, volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setRowStates((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], volume: clamped };
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
      haltPlayback();

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
    [rowCount, haltPlayback],
  );

  // ─── Transport: BPM & Swing setters ───────────────────────────

  const setBpm = useCallback((value: number) => {
    setBpmState(Math.max(40, Math.min(240, value)));
  }, []);

  const setSwing = useCallback((value: number) => {
    setSwingState(Math.max(0, Math.min(80, value)));
  }, []);

  // ─── Playback Engine ──────────────────────────────────────────

  const stop = haltPlayback;

  useEffect(() => () => haltPlayback(), [haltPlayback]);

  const playStepAtTime = useCallback(
    (ctx: AudioContext, output: AudioNode, stepIdx: number, stepTime: number) => {
      const pat = patternRef.current;
      const rs = rowStatesRef.current;
      const currentKitParams = kitParamsRef.current;
      const audible = getAudibleRows(rs);

      if (metronomeEnabledRef.current && stepIdx % 4 === 0) {
        playMetronomeClick(ctx, stepTime, output, stepIdx % 16 === 0);
      }

      pat.forEach((row, ri) => {
        if (audible[ri] && row[stepIdx] > VELOCITY_OFF) {
          const vel = Math.round(row[stepIdx] * rs[ri].volume);
          const instParams = currentKitParams?.[kit[ri].id];
          if (instParams) {
            playDrumVoice(ctx, kit[ri].id, stepTime, vel, output, instParams);
          } else {
            playDrumVoice(ctx, kit[ri].id, stepTime, vel, output);
          }
        }
      });

      setTimeout(() => setCurrentStep(stepIdx), 0);
    },
    [kit],
  );

  const scheduleStepTimer = useCallback(
    (ctx: AudioContext, output: AudioNode) => {
      const lookAhead = 0.05;
      const scheduleInterval = 25;

      const scheduler = () => {
        const currentBpm = bpmRef.current;
        const currentSwing = swingRef.current;
        const totalSteps = stepsRef.current;
        const stepDuration = 60 / currentBpm / 4;

        while (nextStepTimeRef.current < ctx.currentTime + lookAhead) {
          const stepIdx = stepIndexRef.current % totalSteps;
          const stepTime = nextStepTimeRef.current;
          playStepAtTime(ctx, output, stepIdx, stepTime);

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
    [playStepAtTime],
  );

  const start = useCallback(() => {
    haltPlayback();
    const externalCtx = options?.getAudioContext?.() ?? null;
    const ctx = externalCtx ?? ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const output = options?.getOutputNode?.() ?? ctx.destination;
    stepIndexRef.current = 0;
    nextStepTimeRef.current = ctx.currentTime + 0.05;
    setPlaying(true);

    const totalSteps = stepsRef.current;
    const stepDurations = buildStepDurations(
      totalSteps,
      bpmRef.current,
      swingRef.current,
    );

    void (async () => {
      const workletReady = await ensureDrumSchedulerWorklet(ctx);
      if (workletReady) {
        const node = createDrumSchedulerNode(ctx, (msg) => {
          playStepAtTime(ctx, output, msg.index, msg.time);
        });
        if (node) {
          workletNodeRef.current = node;
          node.port.postMessage({
            type: "configure",
            totalSteps,
            stepDurations,
          });
          node.port.postMessage({ type: "start" });
          return;
        }
      }
      scheduleStepTimer(ctx, output);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- options is a stable object ref; including it causes infinite re-creation
  }, [haltPlayback, playStepAtTime, scheduleStepTimer, options?.getAudioContext, options?.getOutputNode]);

  // ─── Return ───────────────────────────────────────────────────

  return {
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
    loadPreset,
    setPattern,
    toggleMute,
    toggleSolo,
    setRowVolume,
    setBpm,
    setSwing,
    metronomeEnabled,
    setMetronomeEnabled,
    start,
    stop,
  };
}
