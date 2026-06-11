/**
 * useMasterProcessing — 3-band EQ + compressor inserted into the master bus.
 *
 * Chain when both enabled:
 *   masterGain → lowShelf → midPeak → highShelf → compressor → (existing limiter/analyser path)
 *
 * When disabled, the respective section is bypassed (nodes disconnected).
 * Uses the existing reconnectMasterBus pattern: we reconnect the pre-limiter chain
 * by intercepting the masterGain output.
 */
import { useCallback, useRef } from "react";
import { create } from "zustand";
import type {
  MasterEqState,
  MasterCompressorState,
} from "../../types/masterBus";
import {
  defaultMasterEq,
  defaultMasterCompressor,
} from "../../types/masterBus";

/* ─── Store ────────────────────────────────────────────────────── */

interface MasterProcessingStore {
  eq: MasterEqState;
  compressor: MasterCompressorState;
  setEq: (update: Partial<MasterEqState>) => void;
  setCompressor: (update: Partial<MasterCompressorState>) => void;
  resetEq: () => void;
  resetCompressor: () => void;
}

export const useMasterProcessingStore = create<MasterProcessingStore>((set) => ({
  eq: { ...defaultMasterEq },
  compressor: { ...defaultMasterCompressor },
  setEq: (update) => set((s) => ({ eq: { ...s.eq, ...update } })),
  setCompressor: (update) =>
    set((s) => ({ compressor: { ...s.compressor, ...update } })),
  resetEq: () => set({ eq: { ...defaultMasterEq } }),
  resetCompressor: () => set({ compressor: { ...defaultMasterCompressor } }),
}));

/* ─── Node Refs ────────────────────────────────────────────────── */

export interface MasterProcessingNodes {
  lowShelf: BiquadFilterNode | null;
  midPeak: BiquadFilterNode | null;
  highShelf: BiquadFilterNode | null;
  compressor: DynamicsCompressorNode | null;
}

/* ─── Hook ─────────────────────────────────────────────────────── */

export interface UseMasterProcessingReturn {
  /** Create and configure the processing nodes for a given AudioContext. */
  ensureProcessingNodes: (ctx: AudioContext) => MasterProcessingNodes;
  /** Apply current store state to the live audio nodes (call on state change). */
  applyEqParams: (eq: MasterEqState) => void;
  applyCompressorParams: (comp: MasterCompressorState) => void;
  /** Get the entry/exit nodes for graph wiring. Returns [input, output] — both may be the same node when chain is minimal. */
  getProcessingChainIO: () => { input: AudioNode; output: AudioNode } | null;
  /** Dispose all nodes. */
  disposeNodes: () => void;
  /** Access the raw node refs (for reconnectMasterBus integration). */
  nodesRef: React.MutableRefObject<MasterProcessingNodes>;
}

export function useMasterProcessing(): UseMasterProcessingReturn {
  const nodesRef = useRef<MasterProcessingNodes>({
    lowShelf: null,
    midPeak: null,
    highShelf: null,
    compressor: null,
  });

  const ensureProcessingNodes = useCallback(
    (ctx: AudioContext): MasterProcessingNodes => {
      if (nodesRef.current.lowShelf) return nodesRef.current;

      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 150;
      lowShelf.gain.value = 0;

      const midPeak = ctx.createBiquadFilter();
      midPeak.type = "peaking";
      midPeak.frequency.value = 1000;
      midPeak.Q.value = 1.0;
      midPeak.gain.value = 0;

      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 4000;
      highShelf.gain.value = 0;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = defaultMasterCompressor.threshold;
      compressor.ratio.value = defaultMasterCompressor.ratio;
      compressor.attack.value = defaultMasterCompressor.attack;
      compressor.release.value = defaultMasterCompressor.release;
      compressor.knee.value = 6;

      // Internal chain: lowShelf → midPeak → highShelf → compressor
      lowShelf.connect(midPeak);
      midPeak.connect(highShelf);
      highShelf.connect(compressor);

      nodesRef.current = { lowShelf, midPeak, highShelf, compressor };
      return nodesRef.current;
    },
    [],
  );

  const applyEqParams = useCallback((eq: MasterEqState) => {
    const { lowShelf, midPeak, highShelf } = nodesRef.current;
    if (!lowShelf || !midPeak || !highShelf) return;

    lowShelf.gain.value = eq.enabled ? eq.lowGain : 0;
    midPeak.gain.value = eq.enabled ? eq.midGain : 0;
    highShelf.gain.value = eq.enabled ? eq.highGain : 0;
  }, []);

  const applyCompressorParams = useCallback((comp: MasterCompressorState) => {
    const { compressor } = nodesRef.current;
    if (!compressor) return;

    if (comp.enabled) {
      compressor.threshold.value = comp.threshold;
      compressor.ratio.value = comp.ratio;
      compressor.attack.value = comp.attack;
      compressor.release.value = comp.release;
    } else {
      // Bypass: set to pass-through values
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
    }
  }, []);

  const getProcessingChainIO = useCallback((): {
    input: AudioNode;
    output: AudioNode;
  } | null => {
    const { lowShelf, compressor } = nodesRef.current;
    if (!lowShelf || !compressor) return null;
    return { input: lowShelf, output: compressor };
  }, []);

  const disposeNodes = useCallback(() => {
    const { lowShelf, midPeak, highShelf, compressor } = nodesRef.current;
    try {
      lowShelf?.disconnect();
      midPeak?.disconnect();
      highShelf?.disconnect();
      compressor?.disconnect();
    } catch {
      /* already disconnected */
    }
    nodesRef.current = {
      lowShelf: null,
      midPeak: null,
      highShelf: null,
      compressor: null,
    };
  }, []);

  return {
    ensureProcessingNodes,
    applyEqParams,
    applyCompressorParams,
    getProcessingChainIO,
    disposeNodes,
    nodesRef,
  };
}
