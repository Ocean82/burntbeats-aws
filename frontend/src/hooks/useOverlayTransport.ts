/**
 * useOverlayTransport — Overlay pattern step sequencer synchronized with the
 * main beat maker transport.
 *
 * Manages independent step scheduling for the overlay pattern, using the same
 * BPM and swing as the beat maker. Routes audio through the overlay gain node
 * via drumSynth. Loops at the pattern boundary and resets to step 0 on pattern
 * switch or transport stop.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE INDEPENDENCE GUARANTEE (Requirements 7.1–7.5)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This hook is a fully independent state machine from `useBeatMaker`. It:
 *   - Does NOT import, reference, or call any `useBeatMaker` state or actions
 *   - Does NOT read or write pattern, rowStates, or steps from the grid
 *   - Does NOT share mutable refs with `useBeatMaker`
 *   - Only receives read-only values from the parent component:
 *       ctx (AudioContext), playing, bpm, swing, overlayGainNode
 *   - These values are passed as props — not mutated by this hook
 *
 * Operations performed here (selectPattern, applyVariation, setOverlayVolume)
 * have ZERO effect on grid state. Grid operations (toggleCell, clearCell,
 * setSteps, loadPreset, clearPattern) have ZERO effect on overlay state.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { playDrumVoice } from "../audio/drumSynth";
import type { GenrePresetPattern, VariationType } from "../audio/genrePresets";
import { applyOverlayVariation } from "../audio/overlayVariations";
import { getSwungStepTime } from "../audio/swingQuantize";
import { DEFAULT_KIT, VELOCITY_OFF } from "../audio/types";
import type { VelocityPattern } from "../audio/types";

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_OVERLAY_VOLUME = 0.6;
const SCHEDULE_LOOKAHEAD = 0.05; // 50ms lookahead buffer
const SCHEDULE_INTERVAL = 25; // check every 25ms (matches beat maker)

// ─── Interface ──────────────────────────────────────────────────────

export interface UseOverlayTransportReturn {
  // State
  activePattern: GenrePresetPattern | null;
  activeVariation: VariationType | null;
  currentStep: number;
  overlayVolume: number;
  effectivePattern: VelocityPattern | null;

  // Actions
  selectPattern: (pattern: GenrePresetPattern | null) => void;
  applyVariation: (type: VariationType | null) => void;
  setOverlayVolume: (volume: number) => void;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useOverlayTransport(
  ctx: AudioContext | null,
  playing: boolean,
  bpm: number,
  swing: number,
  overlayGainNode: GainNode | null,
): UseOverlayTransportReturn {
  // ─── State ──────────────────────────────────────────────────────

  const [activePattern, setActivePattern] = useState<GenrePresetPattern | null>(null);
  const [activeVariation, setActiveVariation] = useState<VariationType | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [overlayVolume, setOverlayVolumeState] = useState(DEFAULT_OVERLAY_VOLUME);
  const [effectivePattern, setEffectivePattern] = useState<VelocityPattern | null>(null);

  // ─── Refs for scheduler closure ─────────────────────────────────

  const timerRef = useRef<number | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepIndexRef = useRef(0);
  const patternRef = useRef<VelocityPattern | null>(null);
  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  const activePatternRef = useRef<GenrePresetPattern | null>(null);
  const patternSwitchRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    swingRef.current = swing;
  }, [swing]);

  // ─── Compute effective pattern ──────────────────────────────────

  useEffect(() => {
    if (!activePattern) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous derived state from external pattern prop; must stay in sync
      setEffectivePattern(null);
      patternRef.current = null;
      return;
    }

    const computed = activeVariation
      ? applyOverlayVariation(activePattern.pattern, activeVariation)
      : activePattern.pattern;

    setEffectivePattern(computed);
    patternRef.current = computed;
  }, [activePattern, activeVariation]);

  // ─── Actions ────────────────────────────────────────────────────

  const selectPattern = useCallback((pattern: GenrePresetPattern | null) => {
    setActivePattern(pattern);
    activePatternRef.current = pattern;

    if (pattern) {
      // Signal a pattern switch so scheduler restarts from step 0
      patternSwitchRef.current = true;
    }
  }, []);

  const applyVariation = useCallback((type: VariationType | null) => {
    setActiveVariation(type);
  }, []);

  const setOverlayVolume = useCallback((volume: number) => {
    const clamped = Math.max(0.0, Math.min(1.0, volume));
    setOverlayVolumeState(clamped);
  }, []);

  // ─── Scheduler ──────────────────────────────────────────────────

  const stopScheduler = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCurrentStep(-1);
    stepIndexRef.current = 0;
  }, []);

  const startScheduler = useCallback(
    (audioCtx: AudioContext, gainNode: GainNode) => {
      stepIndexRef.current = 0;
      nextStepTimeRef.current = audioCtx.currentTime + SCHEDULE_LOOKAHEAD;

      const scheduler = () => {
        const pat = patternRef.current;
        const currentBpm = bpmRef.current;
        const currentSwing = swingRef.current;

        // If no pattern, just keep ticking without producing audio
        if (!pat || pat.length === 0) {
          timerRef.current = window.setTimeout(scheduler, SCHEDULE_INTERVAL) as unknown as number;
          return;
        }

        const totalSteps = pat[0].length;
        if (totalSteps === 0) {
          timerRef.current = window.setTimeout(scheduler, SCHEDULE_INTERVAL) as unknown as number;
          return;
        }

        const stepDuration = 60 / currentBpm / 4;

        // Handle pattern switch: reset to step 0 at next boundary
        if (patternSwitchRef.current) {
          patternSwitchRef.current = false;
          stepIndexRef.current = 0;
        }

        while (nextStepTimeRef.current < audioCtx.currentTime + SCHEDULE_LOOKAHEAD) {
          const stepIdx = stepIndexRef.current % totalSteps;
          const stepTime = nextStepTimeRef.current;

          // Schedule hits for this step through the overlay gain node
          pat.forEach((row, ri) => {
            if (ri < DEFAULT_KIT.length && row[stepIdx] > VELOCITY_OFF) {
              playDrumVoice(audioCtx, DEFAULT_KIT[ri].id, stepTime, row[stepIdx], gainNode);
            }
          });

          // Update UI step indicator
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

        timerRef.current = window.setTimeout(scheduler, SCHEDULE_INTERVAL) as unknown as number;
      };

      scheduler();
    },
    [],
  );

  // ─── React to playing state changes ─────────────────────────────

  useEffect(() => {
    if (playing && ctx && overlayGainNode) {
      // Start overlay scheduler when transport starts
      // eslint-disable-next-line react-hooks/set-state-in-effect -- scheduler lifecycle must be synchronous with transport state transitions
      stopScheduler();
      startScheduler(ctx, overlayGainNode);
    } else {
      // Stop when transport stops or prerequisites missing
      stopScheduler();
    }

    return () => {
      stopScheduler();
    };
  }, [playing, ctx, overlayGainNode, stopScheduler, startScheduler]);

  // ─── Return ───────────────────────────────────────────────────────

  return {
    activePattern,
    activeVariation,
    currentStep,
    overlayVolume,
    effectivePattern,
    selectPattern,
    applyVariation,
    setOverlayVolume,
  };
}
