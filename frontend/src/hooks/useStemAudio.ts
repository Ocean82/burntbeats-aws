/**
 * useStemAudio — manages stem AudioBuffers, waveform data, and loading state.
 * Extracted from App.tsx to keep audio data management separate from UI.
 * Note: Currently unused — App.tsx uses useStemLoading + useWaveformCompute instead.
 * Kept for potential future use as a combined hook.
 */
import { useCallback, useState } from "react";
import { fetchStemWavAsArrayBuffer } from "../api";
import type { StemResult } from "../types";

interface UseStemAudioReturn {
  stemBuffers: Record<string, AudioBuffer>;
  stemWaveforms: Record<string, number[]>;
  loadedTracks: Record<string, boolean>;
  isLoadingStems: boolean;
  loadError: string | null;
  setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>;
  loadStemsIntoBuffers: (
    splitResultStems: StemResult[],
    audioContextRef: React.MutableRefObject<AudioContext | null>,
    onInitStemStates: (ids: string[]) => void
  ) => Promise<void>;
  clearStemData: () => void;
  clearLoadError: () => void;
}

export function useStemAudio(): UseStemAudioReturn {
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>({});
  const [stemWaveforms, setStemWaveforms] = useState<Record<string, number[]>>({});
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStemsIntoBuffers = useCallback(async (
    splitResultStems: StemResult[],
    audioContextRef: React.MutableRefObject<AudioContext | null>,
    onInitStemStates: (ids: string[]) => void
  ) => {
    setLoadError(null);
    if (splitResultStems.length === 0) return;
    setIsLoadingStems(true);

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) { 
      setIsLoadingStems(false); 
      setLoadError("AudioContext not supported in this browser");
      return; 
    }

    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
    const context = audioContextRef.current;
    await context.resume();

    const newBuffers: Record<string, AudioBuffer> = {};
    const newLoaded: Record<string, boolean> = {};

    const stemsToLoad = splitResultStems.filter((s) => !stemBuffers[s.id]);
    if (stemsToLoad.length > 0) {
      try {
        const results = await Promise.all(
          stemsToLoad.map(async (stem) => {
            const arr = await fetchStemWavAsArrayBuffer(stem.url);
            const buffer = await context.decodeAudioData(arr);
            return { id: stem.id, buffer };
          })
        );
        for (const { id, buffer } of results) {
          newBuffers[id] = buffer;
          newLoaded[id] = true;
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error("Failed to load stems:", e);
        setLoadError(e instanceof Error ? e.message : "Unknown error loading stems");
      }
    }

    for (const stem of splitResultStems) {
      if (stemBuffers[stem.id]) {
        newBuffers[stem.id] = stemBuffers[stem.id];
        newLoaded[stem.id] = true;
      }
    }

    setStemBuffers((prev) => ({ ...prev, ...newBuffers }));
    setLoadedTracks((prev) => ({ ...prev, ...newLoaded }));
    onInitStemStates(splitResultStems.map((s) => s.id));
    setIsLoadingStems(false);
  }, [stemBuffers]);

  const clearStemData = useCallback(() => {
    setStemBuffers({});
    setStemWaveforms({});
    setLoadedTracks({});
  }, []);

  const clearLoadError = useCallback(() => {
    setLoadError(null);
  }, []);

  return {
    stemBuffers,
    stemWaveforms,
    loadedTracks,
    isLoadingStems,
    loadError,
    setStemBuffers,
    loadStemsIntoBuffers,
    clearStemData,
    clearLoadError,
  };
}
