/**
 * useStemLoading: fetches stem WAV URLs and decodes them into AudioBuffers.
 * Manages stemBuffers, loadedTracks, and isLoadingStems state.
 * Supports aborting in-flight requests when stems change.
 * Reloads when stem URL changes (expand, new job) — not only when id is new.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import {
  resolveStemAudioArrayBuffer,
  stemEntryToAudioSource,
} from "../utils/resolveStemAudio";
import { entriesNeedingStemLoad } from "../utils/stemLoadUtils";

export interface StemEntry {
  id: string;
  url: string;
  file?: File;
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
  useEffect(() => {
    stemBuffersRef.current = stemBuffers;
  }, [stemBuffers]);
  const loadedUrlByIdRef = useRef<Record<string, string>>({});
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [loadingErrorsById, setLoadingErrorsById] = useState<Record<string, string>>({});
  const loadIdRef = useRef<number>(0);

  const loadStemsIntoBuffers = useCallback(async () => {
    if (allStemEntries.length === 0) {
      setStemBuffers({});
      setLoadedTracks({});
      loadedUrlByIdRef.current = {};
      setIsLoadingStems(false);
      setLoadingError(null);
      setLoadingErrorsById({});
      return;
    }

    const currentLoadId = ++loadIdRef.current;
    setIsLoadingStems(true);
    setLoadingError(null);
    setLoadingErrorsById({});

    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setIsLoadingStems(false);
      return;
    }
    if (!audioContextRef.current) audioContextRef.current = new Ctor();
    const ctx = audioContextRef.current;

    const existing = stemBuffersRef.current;
    const newBuffers: Record<string, AudioBuffer> = {};
    const newLoaded: Record<string, boolean> = {};
    const errorsById: Record<string, string> = {};

    const needsLoad = entriesNeedingStemLoad(
      allStemEntries,
      existing,
      loadedUrlByIdRef.current,
    );

    if (needsLoad.length > 0) {
      // Limit concurrent fetch+decode to avoid CPU/memory spikes when many stems are loaded.
      const HW = typeof navigator !== "undefined" && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency : 4;
      const CONCURRENCY = Math.max(1, Math.min(4, HW - 1));
      const results: PromiseSettledResult<{ id: string; url: string; buf: AudioBuffer }>[] = new Array(needsLoad.length);
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= needsLoad.length) break;
          const stem = needsLoad[idx];
          try {
            if (loadIdRef.current !== currentLoadId) throw new Error("ABORTED");
            const ab = await resolveStemAudioArrayBuffer(stemEntryToAudioSource(stem));
            if (loadIdRef.current !== currentLoadId) throw new Error("ABORTED");
            const buf = await ctx.decodeAudioData(ab.slice(0));
            results[idx] = { status: "fulfilled", value: { id: stem.id, url: stem.url, buf } } as const;
          } catch (err) {
            results[idx] = { status: "rejected", reason: err } as const;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, needsLoad.length) }, () => worker()));
      const settled = results;

      if (loadIdRef.current !== currentLoadId) {
        return;
      }

      let aborted = false;
      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        const stem = needsLoad[i];
        if (result.status === "fulfilled") {
          newBuffers[result.value.id] = result.value.buf;
          newLoaded[result.value.id] = true;
          loadedUrlByIdRef.current[result.value.id] = result.value.url;
        } else {
          const reason = result.reason;
          if (reason instanceof Error && reason.message === "ABORTED") {
            aborted = true;
            break;
          }
          const msg =
            reason instanceof Error ? reason.message : "Unknown error";
          errorsById[stem.id] = msg;
        }
      }

      if (aborted) {
        return;
      }
    }

    for (const e of allStemEntries) {
      if (newBuffers[e.id]) continue;
      if (existing[e.id] && loadedUrlByIdRef.current[e.id] === e.url) {
        newBuffers[e.id] = existing[e.id];
        newLoaded[e.id] = true;
      }
    }

    if (loadIdRef.current !== currentLoadId) {
      return;
    }

    const allowedIds = new Set(allStemEntries.map((e) => e.id));
    for (const id of Object.keys(loadedUrlByIdRef.current)) {
      if (!allowedIds.has(id)) {
        delete loadedUrlByIdRef.current[id];
      }
    }

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

    const errorIds = Object.keys(errorsById);
    if (errorIds.length > 0) {
      setLoadingErrorsById(errorsById);
      const summary = `Failed to load ${errorIds.length} stem(s): ${errorsById[errorIds[0]]}`;
      setLoadingError(summary);
      setSplitError(summary);
      if (import.meta.env.DEV) console.error("Stem load errors:", errorsById);
    }

    setIsLoadingStems(false);
  }, [allStemEntries, audioContextRef, setSplitError, setStemStates]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger async load when entries change
    void loadStemsIntoBuffers();
  }, [loadStemsIntoBuffers]);

  const clearStemLoadingState = useCallback(() => {
    setStemBuffers({});
    setLoadedTracks({});
    loadedUrlByIdRef.current = {};
    setIsLoadingStems(false);
    setLoadingError(null);
    setLoadingErrorsById({});
  }, []);

  const retryLoadStems = useCallback(() => {
    setLoadingError(null);
    setLoadingErrorsById({});
    setStemBuffers({});
    setLoadedTracks({});
    loadedUrlByIdRef.current = {};
    void loadStemsIntoBuffers();
  }, [loadStemsIntoBuffers]);

  return {
    stemBuffers,
    setStemBuffers,
    loadedTracks,
    isLoadingStems,
    clearStemLoadingState,
    loadingError,
    loadingErrorsById,
    retryLoadStems,
  };
}
