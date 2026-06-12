/**
 * useMasterBus — Master bus audio graph with gain nodes and dynamics compressor.
 *
 * Creates a shared AudioContext with two gain nodes (grid + overlay) routed
 * through a DynamicsCompressorNode to the destination. Provides volume control
 * with linear ramps (≤20ms) to prevent clicks.
 *
 * Audio topology:
 *   Grid audio → gridGainNode → compressor → destination
 *   Overlay audio → overlayGainNode → compressor → destination
 */
import { useCallback, useRef, useState } from "react";

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_GRID_VOLUME = 0.8;
const DEFAULT_OVERLAY_VOLUME = 0.6;
const RAMP_TIME_SECONDS = 0.02; // 20ms linear ramp to prevent clicks

// ─── Interface ──────────────────────────────────────────────────────

export interface UseMasterBusReturn {
  audioContext: AudioContext | null;
  gridGainNode: GainNode | null;
  overlayGainNode: GainNode | null;
  gridVolume: number;
  overlayVolume: number;
  setGridVolume: (vol: number) => void;
  setOverlayVolume: (vol: number) => void;
  initAudio: () => AudioContext;
  /** Getter for the current AudioContext (always reads the latest ref). */
  getAudioContext: () => AudioContext | null;
  /** Getter for the current grid gain node (always reads the latest ref). */
  getGridGainNode: () => GainNode | null;
  /** Getter for the current overlay gain node (always reads the latest ref). */
  getOverlayGainNode: () => GainNode | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Clamp a value to [0.0, 1.0]. */
function clampVolume(value: number): number {
  return Math.max(0.0, Math.min(1.0, value));
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useMasterBus(): UseMasterBusReturn {
  const [gridVolume, setGridVolumeState] = useState(DEFAULT_GRID_VOLUME);
  const [overlayVolume, setOverlayVolumeState] = useState(DEFAULT_OVERLAY_VOLUME);

  const ctxRef = useRef<AudioContext | null>(null);
  const gridGainRef = useRef<GainNode | null>(null);
  const overlayGainRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  // ─── Init Audio ─────────────────────────────────────────────────

  const initAudio = useCallback((): AudioContext => {
    // Return existing context if already initialized
    if (ctxRef.current) return ctxRef.current;

    try {
      const ctx = new AudioContext();

      // Create compressor node
      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(ctx.destination);
      compressorRef.current = compressor;

      // Create grid gain node → compressor
      const gridGain = ctx.createGain();
      gridGain.gain.value = DEFAULT_GRID_VOLUME;
      gridGain.connect(compressor);
      gridGainRef.current = gridGain;

      // Create overlay gain node → compressor
      const overlayGain = ctx.createGain();
      overlayGain.gain.value = DEFAULT_OVERLAY_VOLUME;
      overlayGain.connect(compressor);
      overlayGainRef.current = overlayGain;

      ctxRef.current = ctx;

      // Resume if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      return ctx;
    } catch {
      // AudioContext creation failed — return null nodes via refs
      ctxRef.current = null;
      gridGainRef.current = null;
      overlayGainRef.current = null;
      compressorRef.current = null;
      // Throw so callers know init failed; but refs stay null for graceful degradation
      throw new Error("Failed to create AudioContext");
    }
  }, []);

  // ─── Volume Controls ──────────────────────────────────────────

  const setGridVolume = useCallback((vol: number) => {
    const clamped = clampVolume(vol);
    setGridVolumeState(clamped);

    const gain = gridGainRef.current;
    const ctx = ctxRef.current;
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        clamped,
        ctx.currentTime + RAMP_TIME_SECONDS,
      );
    }
  }, []);

  const setOverlayVolume = useCallback((vol: number) => {
    const clamped = clampVolume(vol);
    setOverlayVolumeState(clamped);

    const gain = overlayGainRef.current;
    const ctx = ctxRef.current;
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        clamped,
        ctx.currentTime + RAMP_TIME_SECONDS,
      );
    }
  }, []);

  // ─── Getters (always read current ref values) ─────────────────

  const getAudioContext = useCallback((): AudioContext | null => ctxRef.current, []);
  const getGridGainNode = useCallback((): GainNode | null => gridGainRef.current, []);
  const getOverlayGainNode = useCallback((): GainNode | null => overlayGainRef.current, []);

  // ─── Return ───────────────────────────────────────────────────

  /* eslint-disable react-hooks/refs -- Web Audio nodes are stable singleton refs; consumers need synchronous access for AudioContext operations */
  return {
    audioContext: ctxRef.current,
    gridGainNode: gridGainRef.current,
    overlayGainNode: overlayGainRef.current,
    gridVolume,
    overlayVolume,
    setGridVolume,
    setOverlayVolume,
    initAudio,
    getAudioContext,
    getGridGainNode,
    getOverlayGainNode,
  };
  /* eslint-enable react-hooks/refs */
}
