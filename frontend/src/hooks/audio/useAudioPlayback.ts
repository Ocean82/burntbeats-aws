/**
 * useAudioPlayback — orchestrator that composes:
 *   - useAudioContext   (master bus + AudioContext lifecycle)
 *   - usePlayhead       (position tracking + rAF)
 *   - usePlaybackTransport  (mix play/stop/seek)
 *   - usePreviewPlayback    (stem preview play/seek)
 *   - useMixAnalyser        (analyser delegation)
 *
 * All heavy state and large callbacks now live in the extracted hooks.
 * This file is ~200 LOC: composition + cross-cutting concerns only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StemResult } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { useAudioContext } from "./useAudioContext";
import { usePlayhead } from "./usePlayhead";
import { destroyAllPlugins } from "./plugin-pool";
import { stopMixStemRuntime } from "./runtime-cleanup";
import { createPreviewRuntime } from "./preview-runtime";
import { createMixRuntime } from "./mix-runtime";
import { useMixAnalyser } from "./useMixAnalyser";
import { usePlaybackTransport } from "./usePlaybackTransport";
import { usePreviewPlayback } from "./usePreviewPlayback";
import { resolvePlaybackBpm } from "../../utils/tempoSync";
import { filterStemsForAudibleMix } from "../../utils/stemAudibility";
import type { SeekPhase } from "../../types/playbackSeek";
import { PitchTempoPlugin } from "pitch-plugin";
import {
  getStemTrimWallDurationSeconds,
  maxTrimWallDurationSeconds,
  createStemPreviewBuffer,
  type StemDspChain,
} from "../../utils/audio";
import {
  stemRoutingSignature,
  stemTrimSignature,
  stemPitchTempoSignature,
  stemMuteSoloSignature,
} from "../../utils/stemPlaybackUtils";
import { fetchStemWavAsArrayBuffer } from "../../api";

export type { SeekPhase };

export interface UseAudioPlaybackOptions {
  onError?: (message: string) => void;
  stemStates?: Record<string, StemEditorState>;
  playbackBpm?: number | null;
  globalPitchSemitones?: number;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export interface UseAudioPlaybackReturn {
  isPlayingMix: boolean;
  isPlayingMixRef: React.MutableRefObject<boolean>;
  playingStem: string | null;
  loadingPreviewStemId: string | null;
  playheadPosition: number;
  getPlayheadPosition: () => number;
  subscribePlayheadPosition: (listener: () => void) => () => void;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  handlePlayMix: (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>,
  ) => Promise<void>;
  handleSeekMix: (pct: number, opts?: { phase?: SeekPhase }) => void;
  handleStopMix: () => void;
  handlePreviewStem: (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
    stemStates?: Record<string, StemEditorState>,
  ) => Promise<void>;
  stopPreview: () => void;
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  getStemAnalyserTimeDomainData: (stemId: string) => Uint8Array | null;
  getMasterRecordingStream: () => MediaStream | null;
  masterVolume: number;
  setMasterVolume: (value: number) => void;
  masterLimiterEnabled: boolean;
  setMasterLimiterEnabled: (enabled: boolean) => void;
  applyMasterEq: (eq: import("../../types/masterBus").MasterEqState) => void;
  applyMasterCompressor: (comp: import("../../types/masterBus").MasterCompressorState) => void;
  loopEnabled: boolean;
  setLoopEnabled: (enabled: boolean) => void;
}

export type MixStemRuntime = {
  stemId: string;
  dsp: StemDspChain;
  source: AudioBufferSourceNode;
  plugin: PitchTempoPlugin | null;
  fadeNode: GainNode | null;
};

function withGlobalPitch(
  stemStates: Record<string, StemEditorState>,
  globalPitch: number,
): Record<string, StemEditorState> {
  if (globalPitch === 0) return stemStates;
  const out: Record<string, StemEditorState> = {};
  for (const [id, st] of Object.entries(stemStates)) {
    out[id] = { ...st, pitchSemitones: Math.max(-12, Math.min(12, st.pitchSemitones + globalPitch)) };
  }
  return out;
}

export function useAudioPlayback(
  options: UseAudioPlaybackOptions = {},
): UseAudioPlaybackReturn {
  const {
    stemStates: stemStatesProp,
    playbackBpm,
    globalPitchSemitones = 0,
    audioContextRef: sharedAudioContextRef,
  } = options;
  void options.onError;

  const playbackBpmRef = useRef(resolvePlaybackBpm(playbackBpm ?? undefined));
  useEffect(() => {
    playbackBpmRef.current = resolvePlaybackBpm(playbackBpm ?? undefined);
  }, [playbackBpm]);

  const globalPitchRef = useRef(globalPitchSemitones);
  useEffect(() => {
    globalPitchRef.current = globalPitchSemitones;
  }, [globalPitchSemitones]);

  const pluginPoolRef = useRef<Map<string, PitchTempoPlugin>>(new Map());

  // --- Master bus ---
  const {
    audioContextRef,
    getOrCreateContext,
    ensureMasterBus,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    masterVolume,
    setMasterVolume,
    masterLimiterEnabled,
    setMasterLimiterEnabled,
    applyMasterEq,
    applyMasterCompressor,
    getMasterRecordingStream,
    destroyContext,
  } = useAudioContext(
    sharedAudioContextRef ? { audioContextRef: sharedAudioContextRef } : {},
  );

  // --- Playhead ---
  const {
    playheadPositionRef,
    getPlayheadPosition,
    subscribePlayheadPosition,
    emitPlayheadPosition,
    cancelPlayheadTracker,
    startPlayheadTracker,
  } = usePlayhead();

  // --- Transport (mix playback) ---
  const transport = usePlaybackTransport({
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
    withGlobalPitch,
    stemRoutingSignature,
    stemTrimSignature,
    stemPitchTempoSignature,
    stemMuteSoloSignature,
  });

  // --- Preview (stem playback) ---
  const preview = usePreviewPlayback({
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
  });

  // --- Analyser ---
  const analyser = useMixAnalyser({
    currentPreviewRuntimeRef: preview.currentPreviewRuntimeRef,
    mixStemRuntimesRef: transport.mixStemRuntimesRef,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    getMasterRecordingStream,
  });

  // Stabilize cross-hook references for exhaustiveness-deps compliance
  const stopPreview = preview.stopPreview;
  const handleStopMixTransport = transport.handleStopMix;
  const handlePlayMixTransport = transport.handlePlayMix;
  const handleSeekMixTransport = transport.handleSeekMix;
  const handlePreviewStemTransport = preview.handlePreviewStem;
  const seekToPreview = preview.seekToPreview;

  // --- Loop state ---
  const [loopEnabled, setLoopEnabled] = usePlaybackLoopState(false);
  const loopEnabledRef = useRef(false);
  const setLoopEnabledWrapped = useCallback((enabled: boolean) => {
    setLoopEnabled(enabled);
    loopEnabledRef.current = enabled;
  }, [setLoopEnabled]);

  // --- Sync EQ/gain on running playbacks when stemStates change ---
  useEffect(() => {
    if (!stemStatesProp) return;
    if (transport.isPlayingMix) {
      for (const r of transport.mixStemRuntimesRef.current) {
        const st = stemStatesProp[r.stemId];
        if (st) {
          r.dsp.update(st.mixer, Math.pow(10, st.mixer.gain / 20));
        }
      }
    }
    if (preview.playingStem && preview.currentPreviewRuntimeRef.current) {
      const r = preview.currentPreviewRuntimeRef.current;
      const st = stemStatesProp[r.stemId];
      if (st) {
        r.dsp.update(st.mixer, Math.pow(10, st.mixer.gain / 20));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemStatesProp, transport.isPlayingMix, preview.playingStem]);

  // --- Cross-cutting callbacks ---
  const handlePlayMix = useCallback(
    async (
      splitResultStems: StemResult[],
      stemStates: Record<string, StemEditorState>,
      stemBuffers: Record<string, AudioBuffer>,
    ) => {
      stopPreview();
      return handlePlayMixTransport(splitResultStems, stemStates, stemBuffers);
    },
    [stopPreview, handlePlayMixTransport],
  );

  const handleStopMix = useCallback(() => {
    handleStopMixTransport();
    stopPreview();
  }, [handleStopMixTransport, stopPreview]);

  const handleSeekMix = useCallback(
    (pct: number, opts?: { phase?: SeekPhase }) => {
      const clamped = Math.max(0, Math.min(100, pct));
      if (preview.playingStem) {
        void seekToPreview(clamped);
      } else {
        handleSeekMixTransport(clamped, opts);
      }
    },
    [preview.playingStem, seekToPreview, handleSeekMixTransport],
  );

  const handlePreviewStem = useCallback(
    async (
      stemId: string,
      stemUrl: string | undefined,
      stemBuffers: Record<string, AudioBuffer>,
      setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
      stemStates?: Record<string, StemEditorState>,
    ) => {
      handleStopMixTransport();
      return handlePreviewStemTransport(stemId, stemUrl, stemBuffers, setStemBuffers, stemStates);
    },
    [handleStopMixTransport, handlePreviewStemTransport],
  );

  // --- Cleanup on unmount ---
  useEffect(() => {
    const pool = pluginPoolRef.current;
    return () => {
      stopPreview();
      handleStopMixTransport();
      destroyAllPlugins(pool);
      destroyContext();
    };
  }, [destroyContext, stopPreview, handleStopMixTransport]);

  // eslint-disable-next-line react-hooks/refs
  return {
    isPlayingMix: transport.isPlayingMix,
    isPlayingMixRef: transport.isPlayingMixRef,
    playingStem: preview.playingStem,
    loadingPreviewStemId: preview.loadingPreviewStemId,
    // eslint-disable-next-line react-hooks/refs
    playheadPosition: playheadPositionRef.current,
    getPlayheadPosition,
    subscribePlayheadPosition,
    audioContextRef,
    handlePlayMix,
    handleSeekMix,
    handleStopMix,
    handlePreviewStem,
    stopPreview,
    getMasterAnalyserTimeDomainData: analyser.getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft: analyser.getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight: analyser.getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData: analyser.getMasterAnalyserFrequencyData,
    getStemAnalyserTimeDomainData: analyser.getStemAnalyserTimeDomainData,
    getMasterRecordingStream: analyser.getMasterRecordingStream,
    masterVolume,
    setMasterVolume,
    masterLimiterEnabled,
    setMasterLimiterEnabled,
    applyMasterEq,
    applyMasterCompressor,
    loopEnabled,
    setLoopEnabled: setLoopEnabledWrapped,
  };
}

function usePlaybackLoopState(initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}
