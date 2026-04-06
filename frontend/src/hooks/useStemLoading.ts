/**
 * useStemLoading: fetches stem WAV URLs and decodes them into AudioBuffers.
 * Manages stemBuffers, loadedTracks, and isLoadingStems state.
 * Supports aborting in-flight requests when stems change.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStemWavAsArrayBuffer } from "../api";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";

interface StemEntry {
  id: string;
  url: string;
}

interface UseStemLoadingArgs {
  allStemEntries: StemEntry[];
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  setStemStates: (
    updater: (
      prev: Record<string, StemEditorState>,
    ) => Record<string, StemEditorState>,
  ) => void;
  setSplitError: (msg: string) => void;
}

export function useStemLoading({
  allStemEntries,
  audioContextRef,
  setStemStates,
  setSplitError,
}: UseStemLoadingArgs) {
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>({});
  const stemBuffersRef = useRef<Record<string, AudioBuffer>>({});
  useEffect(() => { stemBuffersRef.current = stemBuffers; }, [stemBuffers]);
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const loadIdRef = useRef<number>(0);

  const loadStemsIntoBuffers = useCallback(async () => {
    if (allStemEntries.length === 0) {
      setStemBuffers({});
      setLoadedTracks({});
      setIsLoadingStems(false);
      setLoadingError(null);
      return;
    }

    const currentLoadId = ++loadIdRef.current;
    setIsLoadingStems(true);
    setLoadingError(null);

    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setIsLoadingStems(false);
      return;
    }
    if (!audioContextRef.current) audioContextRef.current = new Ctor();
    const ctx = audioContextRef.current;
    await ctx.resume();

    const existing = stemBuffersRef.current;
    const newBuffers: Record<string, AudioBuffer> = {};
    const newLoaded: Record<string, boolean> = {};
    const toLoad = allStemEntries.filter((e) => !existing[e.id]);

    if (toLoad.length > 0) {
      try {
        const results = await Promise.all(toLoad.map(async (stem) => {
          if (loadIdRef.current !== currentLoadId) {
            throw new Error("ABORTED");
          }
          const ab = await fetchStemWavAsArrayBuffer(stem.url);
          if (loadIdRef.current !== currentLoadId) {
            throw new Error("ABORTED");
          }
          const buf = await ctx.decodeAudioData(ab);
          return { id: stem.id, buf };
        }));

        for (const { id, buf } of results) {
          newBuffers[id] = buf;
          newLoaded[id] = true;
        }
      } catch (e) {
        if (e instanceof Error && e.message === "ABORTED") {
          return;
        }
        const errorMsg = e instanceof Error ? e.message : "Unknown error";
        const userMsg = `Failed to load stems: ${errorMsg}`;
        setLoadingError(userMsg);
        setSplitError(userMsg);
        if (import.meta.env.DEV) console.error("Failed to load stems:", e);
        setIsLoadingStems(false);
        return;
      }
    }

    for (const e of allStemEntries) {
      if (existing[e.id]) {
        newBuffers[e.id] = existing[e.id];
        newLoaded[e.id] = true;
      }
    }

    if (loadIdRef.current !== currentLoadId) {
      return;
    }

    const allowedIds = new Set(allStemEntries.map((e) => e.id));
    setStemBuffers((p) => {
      const merged: Record<string, AudioBuffer> = {};
      for (const id of allowedIds) {
        if (newBuffers[id] !== undefined) merged[id] = newBuffers[id];
        else if (p[id]) merged[id] = p[id];
      }
      return merged;
    });
    setLoadedTracks((p) => {
      const next: Record<string, boolean> = {};
      for (const id of allowedIds) {
        if (newLoaded[id] !== undefined) next[id] = newLoaded[id];
        else if (p[id]) next[id] = p[id];
      }
      return next;
    });
    setStemStates((p) => {
      const next: Record<string, StemEditorState> = {};
      for (const e of allStemEntries) {
        next[e.id] = p[e.id] ?? defaultStemState();
      }
      return next;
    });
    setIsLoadingStems(false);
  }, [allStemEntries, audioContextRef, setSplitError, setStemStates]);

  useEffect(() => {
    void loadStemsIntoBuffers();
  }, [loadStemsIntoBuffers]);

  const clearStemLoadingState = useCallback(() => {
    setStemBuffers({});
    setLoadedTracks({});
    setIsLoadingStems(false);
    setLoadingError(null);
  }, []);

  const retryLoadStems = useCallback(() => {
    setLoadingError(null);
    setStemBuffers({});
    setLoadedTracks({});
    void loadStemsIntoBuffers();
  }, [loadStemsIntoBuffers]);

  return { stemBuffers, setStemBuffers, loadedTracks, isLoadingStems, clearStemLoadingState, loadingError, retryLoadStems };
}
