import { useCallback, useEffect, useRef, useState } from "react";
import type { StemEditorState } from "../../stem-editor-state";
import type { StemId } from "../../types";
import type { MixStemRuntime } from "./useAudioPlayback";
import {
  stemPreviewStructuralSignature,
} from "../../utils/stemPlaybackUtils";
import { PitchTempoPlugin } from "pitch-plugin";
import { defaultStemState } from "../../stem-editor-state";

export interface UsePreviewPlaybackReturn {
  playingStem: string | null;
  loadingPreviewStemId: string | null;
  handlePreviewStem: (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
    stemStates?: Record<string, StemEditorState>,
  ) => Promise<void>;
  seekToPreview: (pct: number) => Promise<void>;
  stopPreview: () => void;
  currentPreviewRuntimeRef: React.MutableRefObject<MixStemRuntime | null>;
}

export function usePreviewPlayback(
  deps: {
    getOrCreateContext: () => Promise<AudioContext | null>;
    ensureMasterBus: (ctx: AudioContext) => GainNode;
    emitPlayheadPosition: (pct: number) => void;
    cancelPlayheadTracker: () => void;
    startPlayheadTracker: (
      ctx: AudioContext,
      duration: number,
      startTime: number,
      isPlaying: () => boolean,
    ) => void;
    createPreviewRuntime: (opts: {
      context: AudioContext;
      stemId: string;
      buffer: AudioBuffer;
      stemState: StemEditorState;
      plugin: PitchTempoPlugin | null;
      usePlugin: boolean;
      wallDuration: number;
      wallElapsed: number;
      ensureMasterBus: (ctx: AudioContext) => GainNode;
      bpm: number | undefined;
    }) => MixStemRuntime | null;
    stopMixStemRuntime: (r: MixStemRuntime) => void;
    fetchStemWavAsArrayBuffer: (url: string) => Promise<ArrayBuffer>;
    createStemPreviewBuffer: (ctx: AudioContext, stemId: StemId) => AudioBuffer;
    getStemTrimWallDurationSeconds: (
      buffer: AudioBuffer,
      state: StemEditorState,
      usePlugin: boolean,
    ) => number;
  },
): UsePreviewPlaybackReturn {
  const {
    getOrCreateContext,
    ensureMasterBus,
    emitPlayheadPosition,
    cancelPlayheadTracker,
    startPlayheadTracker,
    createPreviewRuntime,
    stopMixStemRuntime,
    fetchStemWavAsArrayBuffer,
    createStemPreviewBuffer,
    getStemTrimWallDurationSeconds,
  } = deps;

  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [loadingPreviewStemId, setLoadingPreviewStemId] = useState<string | null>(null);
  const currentPreviewRuntimeRef = useRef<MixStemRuntime | null>(null);
  const previewDurationRef = useRef(0);
  const isPlayingPreviewRef = useRef(false);
  const previewStemStateRef = useRef<StemEditorState>(defaultStemState());
  const previewBufferRef = useRef<AudioBuffer | null>(null);
  const prevPreviewStructSigRef = useRef("");
  const prevPreviewTrimSigRef = useRef("");
  const playbackBpmRef = useRef<number | undefined>(undefined);
  const playStartTimeRef = useRef(0);
  const rebuildGenerationRef = useRef(0);

  const stopPreview = useCallback(() => {
    if (currentPreviewRuntimeRef.current) {
      stopMixStemRuntime(currentPreviewRuntimeRef.current);
      currentPreviewRuntimeRef.current = null;
    }
    isPlayingPreviewRef.current = false;
    cancelPlayheadTracker();
    setPlayingStem(null);
  }, [cancelPlayheadTracker, setPlayingStem, stopMixStemRuntime]);

  const seekToPreview = useCallback(
    async (pct: number) => {
      const gen = ++rebuildGenerationRef.current;
      const stemId = playingStem;
      if (!stemId) return;

      const context = await getOrCreateContext();
      if (!context) return;

      const buffer = previewBufferRef.current;
      if (!buffer) return;

      const st = previewStemStateRef.current;
      const wallDuration = getStemTrimWallDurationSeconds(buffer, st, false);
      if (wallDuration <= 0) return;

      if (currentPreviewRuntimeRef.current) {
        stopMixStemRuntime(currentPreviewRuntimeRef.current);
        currentPreviewRuntimeRef.current = null;
      }
      isPlayingPreviewRef.current = false;
      cancelPlayheadTracker();

      const wallElapsed = (wallDuration * pct) / 100;
      const wallRemaining = wallDuration - wallElapsed;
      if (wallRemaining <= 0) {
        emitPlayheadPosition(pct);
        setPlayingStem(null);
        previewStemStateRef.current = defaultStemState();
        return;
      }

      const runtime = createPreviewRuntime({
        context,
        stemId,
        buffer,
        stemState: st,
        plugin: null,
        usePlugin: false,
        wallDuration,
        wallElapsed,
        ensureMasterBus,
        bpm: playbackBpmRef.current,
      });
      if (!runtime) {
        emitPlayheadPosition(pct);
        setPlayingStem(null);
        previewStemStateRef.current = defaultStemState();
        return;
      }

      if (gen !== rebuildGenerationRef.current) {
        stopMixStemRuntime(runtime);
        return;
      }

      previewDurationRef.current = wallRemaining;
      emitPlayheadPosition(pct);
      playStartTimeRef.current = context.currentTime - wallElapsed;
      previewStemStateRef.current = st;
      previewBufferRef.current = buffer;

      runtime.source.onended = () => {
        stopMixStemRuntime(runtime);
        if (currentPreviewRuntimeRef.current?.source === runtime.source) {
          currentPreviewRuntimeRef.current = null;
          isPlayingPreviewRef.current = false;
          setPlayingStem(null);
          prevPreviewStructSigRef.current = "";
          prevPreviewTrimSigRef.current = "";
        }
      };

      currentPreviewRuntimeRef.current = runtime;
      isPlayingPreviewRef.current = true;

      startPlayheadTracker(
        context,
        previewDurationRef.current,
        playStartTimeRef.current,
        () => isPlayingPreviewRef.current,
      );

      setPlayingStem(stemId);
    },
    [
      cancelPlayheadTracker,
      createPreviewRuntime,
      emitPlayheadPosition,
      ensureMasterBus,
      getOrCreateContext,
      getStemTrimWallDurationSeconds,
      setPlayingStem,
      startPlayheadTracker,
      stopMixStemRuntime,
      playingStem,
    ],
  );

  const handlePreviewStem = useCallback(
    async (
      stemId: string,
      stemUrl: string | undefined,
      stemBuffers: Record<string, AudioBuffer>,
      setStemBuffers: React.Dispatch<
        React.SetStateAction<Record<string, AudioBuffer>>
      >,
      stemStates?: Record<string, StemEditorState>,
    ) => {
      const gen = ++rebuildGenerationRef.current;
      if (loadingPreviewStemId === stemId) return;

      if (playingStem === stemId) {
        stopPreview();
        prevPreviewStructSigRef.current = "";
        prevPreviewTrimSigRef.current = "";
        return;
      }

      // External stopMix should be called by the parent (useAudioPlayback)
      setLoadingPreviewStemId(stemId);

      try {
        const context = await getOrCreateContext();
        if (!context) return;

        let buffer: AudioBuffer;
        if (stemBuffers[stemId]) {
          buffer = stemBuffers[stemId];
        } else if (stemUrl) {
          const ab = await fetchStemWavAsArrayBuffer(stemUrl);
          buffer = await context.decodeAudioData(ab);
          setStemBuffers((b) => ({ ...b, [stemId]: buffer }));
        } else {
          buffer = createStemPreviewBuffer(context, stemId as StemId);
        }

        const st =
          stemStates?.[stemId] ??
          previewStemStateRef.current ??
          defaultStemState();

        const wallDuration = getStemTrimWallDurationSeconds(buffer, st, false);
        if (wallDuration <= 0) return;

        const wallElapsed = 0;
        const wallRemaining = wallDuration;

        const runtime = createPreviewRuntime({
          context,
          stemId,
          buffer,
          stemState: st,
          plugin: null,
          usePlugin: false,
          wallDuration,
          wallElapsed,
          ensureMasterBus,
          bpm: playbackBpmRef.current,
        });
        if (!runtime) return;

        if (gen !== rebuildGenerationRef.current) {
          stopMixStemRuntime(runtime);
          return;
        }

        previewDurationRef.current = wallRemaining;
        playStartTimeRef.current = context.currentTime - wallElapsed;
        previewStemStateRef.current = st;
        previewBufferRef.current = buffer;

        runtime.source.onended = () => {
          stopMixStemRuntime(runtime);
          if (currentPreviewRuntimeRef.current?.source === runtime.source) {
            currentPreviewRuntimeRef.current = null;
            isPlayingPreviewRef.current = false;
            setPlayingStem(null);
            prevPreviewStructSigRef.current = "";
            prevPreviewTrimSigRef.current = "";
          }
        };

        currentPreviewRuntimeRef.current = runtime;
        isPlayingPreviewRef.current = true;

        startPlayheadTracker(
          context,
          previewDurationRef.current,
          playStartTimeRef.current,
          () => isPlayingPreviewRef.current,
        );

        setPlayingStem(stemId);
      } finally {
        setLoadingPreviewStemId(null);
      }
    },
    [
      createPreviewRuntime,
      ensureMasterBus,
      getOrCreateContext,
      getStemTrimWallDurationSeconds,
      setPlayingStem,
      setLoadingPreviewStemId,
      startPlayheadTracker,
      stopMixStemRuntime,
      stopPreview,
      createStemPreviewBuffer,
      fetchStemWavAsArrayBuffer,
      playingStem,
      loadingPreviewStemId,
    ],
  );

  // Hot-swap preview when pitch/stretch/trim change for the playing stem
  useEffect(() => {
    if (!playingStem) return;
    if (!currentPreviewRuntimeRef.current) return;
    const st = previewStemStateRef.current;
    if (!st) return;

    const sig = stemPreviewStructuralSignature(st);
    if (sig === prevPreviewStructSigRef.current) return;
    prevPreviewStructSigRef.current = sig;

    const trimSig = `${st.trim.start}:${st.trim.end}`;
    const trimChanged = trimSig !== prevPreviewTrimSigRef.current;
    prevPreviewTrimSigRef.current = trimSig;
    previewStemStateRef.current = st;

    if (!trimChanged) return;

    const pct = 0;
    void seekToPreview(pct);
  }, [playingStem, seekToPreview]);

  return {
    playingStem,
    loadingPreviewStemId,
    handlePreviewStem,
    seekToPreview,
    stopPreview,
    currentPreviewRuntimeRef,
  };
}
