/**
 * Master Processing Store — Zustand state for the master bus EQ and compressor.
 *
 * The actual Web Audio nodes live in useAudioContext.ts.
 * This store holds the UI state and is synced to the audio graph
 * via useMasterProcessingSync.ts.
 */
import { create } from "zustand";
import type {
  MasterEqState,
  MasterCompressorState,
} from "../../types/masterBus";
import {
  defaultMasterEq,
  defaultMasterCompressor,
} from "../../types/masterBus";

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
