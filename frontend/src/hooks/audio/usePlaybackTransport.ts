import { useCallback, useEffect, useRef, useState } from "react";
import type { StemEditorState } from "../../stem-editor-state";
import type { StemResult } from "../../types";
import type { SeekPhase } from "../../types/playbackSeek";
import type { MixStemRuntime } from "./useAudioPlayback";
import { PitchTempoPlugin } from "pitch-plugin";
import { defaultStemState } from "../../stem-editor-state";

export interface UsePlaybackTransportReturn {
  isPlayingMix: boolean;
  isPlayingMixRef: React.MutableRefObject<boolean>;
  handlePlayMix: (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>,
  ) => Promise<void>;
  handleStopMix: () => void;
  handleSeekMix: (pct: number, opts?: { phase?: SeekPhase }) => void;
  mixStemRuntimesRef: React.MutableRefObject<MixStemRuntime[]>;
  /** Update the internal stem states ref so handleSeekMix rebuilds with current mute/solo. */
  updateStemStates: (states: Record<string, StemEditorState>) => void;
}

export function usePlaybackTransport(
  deps: {
    emitPlayheadPosition: (pct: number) => void;
    cancelPlayheadTracker: () => void;
    startPlayheadTracker: (
      ctx: AudioContext,
      duration: number,
      startTime: number,
      isPlaying: () => boolean,
    ) => void;
    getOrCreateContext: () => Promise<AudioContext | null>;
    ensureMasterBus: (ctx: AudioContext) => GainNode;
    createMixRuntime: (opts: {
      context: AudioContext;
      stemId: string;
      buffer: AudioBuffer;
      stemState: StemEditorState;
      plugin: PitchTempoPlugin | null;
      usePlugin: boolean;
      elapsedWall: number;
      stemWallDuration: number;
    ensureMasterBus: (ctx: AudioContext) => GainNode;
      bpm: number | undefined;
    }) => MixStemRuntime | null;
    stopMixStemRuntime: (r: MixStemRuntime) => void;
    filterStemsForAudibleMix: (
      stems: StemResult[],
      states: Record<string, StemEditorState>,
    ) => StemResult[];
    maxTrimWallDurationSeconds: (
      stems: StemResult[],
      buffers: Record<string, AudioBuffer>,
      states: Record<string, StemEditorState>,
      pluginAvailable: boolean,
    ) => number;
    getStemTrimWallDurationSeconds: (
      buffer: AudioBuffer,
      state: StemEditorState,
      usePlugin: boolean,
    ) => number;
    withGlobalPitch: (
      stemStates: Record<string, StemEditorState>,
      globalPitch: number,
    ) => Record<string, StemEditorState>;
    stemRoutingSignature: (
      states: Record<string, StemEditorState>,
      ids: string[],
    ) => string;
    stemTrimSignature: (
      states: Record<string, StemEditorState>,
      ids: string[],
    ) => string;
    stemPitchTempoSignature: (
      states: Record<string, StemEditorState>,
      ids: string[],
    ) => string;
    stemMuteSoloSignature: (
      states: Record<string, StemEditorState>,
      ids: string[],
    ) => string;
  },
): UsePlaybackTransportReturn {
  const {
    emitPlayheadPosition,
    cancelPlayheadTracker,
    startPlayheadTracker,
    getOrCreateContext,
    ensureMasterBus,
    createMixRuntime,
    stopMixStemRuntime,
    filterStemsForAudibleMix,
    maxTrimWallDurationSeconds,
    getStemTrimWallDurationSeconds,
    stemRoutingSignature,
    stemTrimSignature,
    stemPitchTempoSignature,
    stemMuteSoloSignature,
  } = deps;

  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const isPlayingMixRef = useRef(false);
  const mixStemRuntimesRef = useRef<MixStemRuntime[]>([]);
  const lastSplitResultStemsRef = useRef<StemResult[]>([]);
  const lastStemStatesRef = useRef<Record<string, StemEditorState>>({});
  const lastStemBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const prevMixRoutingSigRef = useRef("");
  const prevMixTrimSigRef = useRef("");
  const prevMixPitchTempoSigRef = useRef("");
  const prevMixMuteSoloSigRef = useRef("");
  const trimDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rebuildGenerationRef = useRef(0);
  const playbackBpmRef = useRef<number | undefined>(undefined);
  const playStartTimeRef = useRef(0);
  const mixDurationRef = useRef(0);
  const pluginAvailableRef = useRef<boolean | null>(null);

  const stopMixSourcesPreservePlayhead = useCallback(() => {
    mixStemRuntimesRef.current.forEach(stopMixStemRuntime);
    mixStemRuntimesRef.current = [];
    cancelPlayheadTracker();
  }, [cancelPlayheadTracker, stopMixStemRuntime]);

  const handleStopMix = useCallback(() => {
    if (trimDebounceTimerRef.current !== null) {
      clearTimeout(trimDebounceTimerRef.current);
      trimDebounceTimerRef.current = null;
    }
    prevMixRoutingSigRef.current = "";
    prevMixTrimSigRef.current = "";
    prevMixPitchTempoSigRef.current = "";
    prevMixMuteSoloSigRef.current = "";
    mixStemRuntimesRef.current.forEach(stopMixStemRuntime);
    mixStemRuntimesRef.current = [];
    setIsPlayingMix(false);
    isPlayingMixRef.current = false;
    cancelPlayheadTracker();
    emitPlayheadPosition(0);
  }, [
    cancelPlayheadTracker,
    emitPlayheadPosition,
    setIsPlayingMix,
    stopMixStemRuntime,
  ]);

  const rebuildMixAtPct = useCallback(
    async (pct: number, stemStates: Record<string, StemEditorState>) => {
      const gen = ++rebuildGenerationRef.current;
      const splitResultStems = lastSplitResultStemsRef.current;
      if (splitResultStems.length === 0) return;

      const context = await getOrCreateContext();
      if (!context) return;

      const stemBuffers = lastStemBuffersRef.current;
      const stemsToPlay = filterStemsForAudibleMix(splitResultStems, stemStates);
      if (stemsToPlay.length === 0) {
        handleStopMix();
        return;
      }

      const masterWall = maxTrimWallDurationSeconds(
        stemsToPlay,
        stemBuffers,
        stemStates,
        pluginAvailableRef.current === true,
      );
      if (masterWall <= 0) return;

      stopMixSourcesPreservePlayhead();

      const elapsedWall = (masterWall * pct) / 100;
      mixDurationRef.current = masterWall;
      playStartTimeRef.current = context.currentTime - elapsedWall;
      emitPlayheadPosition(pct);

      const runtimes: MixStemRuntime[] = [];
      for (const stem of stemsToPlay) {
        const buffer = stemBuffers[stem.id];
        if (!buffer) continue;
        const st = stemStates[stem.id] ?? defaultStemState();
        const runtime = createMixRuntime({
          context,
          stemId: stem.id,
          buffer,
          stemState: st,
          plugin: null,
          usePlugin: false,
          elapsedWall,
          stemWallDuration: getStemTrimWallDurationSeconds(buffer, st, false),
          ensureMasterBus,
          bpm: playbackBpmRef.current,
        });
      if (!runtime) continue;
      runtime.source.onended = () => {
        stopMixStemRuntime(runtime);
        mixStemRuntimesRef.current = mixStemRuntimesRef.current.filter(
          (x) => x !== runtime,
        );
        if (mixStemRuntimesRef.current.length === 0) {
          cancelPlayheadTracker();
          emitPlayheadPosition(100);
          setIsPlayingMix(false);
          isPlayingMixRef.current = false;
        }
      };
      runtimes.push(runtime);
    }

    if (runtimes.length === 0) {
      handleStopMix();
      return;
    }

    if (gen !== rebuildGenerationRef.current) return;

    mixStemRuntimesRef.current = runtimes;
    setIsPlayingMix(true);
    isPlayingMixRef.current = true;

    startPlayheadTracker(
      context,
      mixDurationRef.current,
      playStartTimeRef.current,
      () => isPlayingMixRef.current,
    );
  },
  [
    cancelPlayheadTracker,
    emitPlayheadPosition,
    ensureMasterBus,
    filterStemsForAudibleMix,
    getOrCreateContext,
    getStemTrimWallDurationSeconds,
    handleStopMix,
    maxTrimWallDurationSeconds,
    setIsPlayingMix,
    startPlayheadTracker,
    stopMixSourcesPreservePlayhead,
    stopMixStemRuntime,
    createMixRuntime,
  ],
  );

  const rebuildMixAtPctRef = useRef(rebuildMixAtPct);
  // eslint-disable-next-line react-hooks/refs
  rebuildMixAtPctRef.current = rebuildMixAtPct;

  const handlePlayMix = useCallback(
    async (
      splitResultStems: StemResult[],
      stemStates: Record<string, StemEditorState>,
      stemBuffers: Record<string, AudioBuffer>,
    ) => {
      if (isPlayingMix) {
        handleStopMix();
        return;
      }

      const stemsToPlay = filterStemsForAudibleMix(
        splitResultStems,
        stemStates,
      );
      if (stemsToPlay.length === 0) return;

      lastSplitResultStemsRef.current = splitResultStems;
      lastStemStatesRef.current = stemStates;
      lastStemBuffersRef.current = stemBuffers;

      const ids = splitResultStems.map((s) => s.id);
      prevMixRoutingSigRef.current = stemRoutingSignature(stemStates, ids);
      prevMixTrimSigRef.current = stemTrimSignature(stemStates, ids);
      prevMixPitchTempoSigRef.current = stemPitchTempoSignature(stemStates, ids);
      prevMixMuteSoloSigRef.current = stemMuteSoloSignature(stemStates, ids);

      await rebuildMixAtPct(0, stemStates);
    },
    [
      isPlayingMix,
      handleStopMix,
      rebuildMixAtPct,
      filterStemsForAudibleMix,
      stemRoutingSignature,
      stemTrimSignature,
      stemPitchTempoSignature,
      stemMuteSoloSignature,
    ],
  );

  const handleSeekMix = useCallback(
    (pct: number, _opts?: { phase?: SeekPhase }) => {
      const clampedPct = Math.max(0, Math.min(100, pct));
      void rebuildMixAtPctRef.current(clampedPct, lastStemStatesRef.current);
    },
    [],
  );

  // Cleanup stale routing/tracking refs when mix stops
  useEffect(() => {
    if (!isPlayingMix) {
      prevMixRoutingSigRef.current = "";
      prevMixTrimSigRef.current = "";
      prevMixPitchTempoSigRef.current = "";
      prevMixMuteSoloSigRef.current = "";
    }
  }, [isPlayingMix]);

  return {
    isPlayingMix,
    isPlayingMixRef,
    handlePlayMix,
    handleStopMix,
    handleSeekMix,
    mixStemRuntimesRef,
    updateStemStates: useCallback((states: Record<string, StemEditorState>) => {
      lastStemStatesRef.current = states;
    }, []),
  };
}
