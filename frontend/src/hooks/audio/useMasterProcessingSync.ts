/**
 * useMasterProcessingSync — syncs the master processing store to live audio nodes.
 * 
 * Place this hook in a component that has access to the audio playback return
 * (e.g., the AudioProvider or a mixer component). It subscribes to the
 * useMasterProcessingStore and applies changes to the Web Audio graph in real-time.
 */
import { useEffect } from "react";
import { useMasterProcessingStore } from "./useMasterProcessing";
import type { MasterEqState, MasterCompressorState } from "../../types/masterBus";

interface UseMasterProcessingSyncArgs {
  applyMasterEq: (eq: MasterEqState) => void;
  applyMasterCompressor: (comp: MasterCompressorState) => void;
}

/**
 * Subscribes to the master processing store and pushes changes to the audio graph.
 * Call this once in a component that has access to the audio context's apply functions.
 */
export function useMasterProcessingSync({
  applyMasterEq,
  applyMasterCompressor,
}: UseMasterProcessingSyncArgs): void {
  // Sync EQ changes
  const eq = useMasterProcessingStore((s) => s.eq);
  useEffect(() => {
    applyMasterEq(eq);
  }, [eq, applyMasterEq]);

  // Sync compressor changes
  const compressor = useMasterProcessingStore((s) => s.compressor);
  useEffect(() => {
    applyMasterCompressor(compressor);
  }, [compressor, applyMasterCompressor]);
}
