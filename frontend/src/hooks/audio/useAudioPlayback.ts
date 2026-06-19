/**
 * useAudioPlayback — real-time Web Audio mix + stem preview + playhead.
 * Playback uses `playbackRate = getStemEffectiveRate(st)` so live preview matches client + server export.
 *
 * This is the orchestrator hook that composes:
 * - useAudioContext (AudioContext lifecycle + master bus)
 * - usePlayhead (position tracking + animation frame)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStemWavAsArrayBuffer } from "../../api";
import type { StemResult } from "../../types";
import {
  createStemPreviewBuffer,
  getStemTrimWallDurationSeconds,
  maxTrimWallDurationSeconds,
  timeStretchToTempoRatio,
  type StemDspChain,
} from "../../utils/audio";
import {
  defaultStemState,
  type StemEditorState,
} from "../../stem-editor-state";
import { PitchTempoPlugin } from "pitch-plugin";
import { filterStemsForAudibleMix } from "../../utils/stemAudibility";
import {
  stemMuteSoloSignature,
  stemNeedsPlugin,
  stemPitchTempoSignature,
  stemPreviewStructuralSignature,
  stemRoutingSignature,
  stemTrimSignature,
} from "../../utils/stemPlaybackUtils";
import type { SeekPhase } from "../../types/playbackSeek";
import type { StemId } from "../../types";

import { useAudioContext } from "./useAudioContext";
import { usePlayhead } from "./usePlayhead";
import { destroyAllPlugins, getOrCreatePlugin } from "./plugin-pool";
import { stopMixStemRuntime } from "./runtime-cleanup";
import { getStemAnalyserFromRuntimes } from "./analyser-bridge";
import { createPreviewRuntime } from "./preview-runtime";
import { createMixRuntime } from "./mix-runtime";
import { resolvePlaybackBpm } from "../../utils/tempoSync";

export type { SeekPhase };

export type MixStemRuntime = {
  stemId: string;
  dsp: StemDspChain;
  source: AudioBufferSourceNode;
  plugin: PitchTempoPlugin | null;
  fadeNode: GainNode | null;
};

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
    setStemBuffers: React.Dispatch<
      React.SetStateAction<Record<string, AudioBuffer>>
    >,
    stemStates?: Record<string, StemEditorState>,
  ) => Promise<void>;
  stopPreview: () => void;
  /** Time-domain bytes for VU / RMS (master bus). */
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  /** Left channel time-domain bytes for stereo meter. */
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  /** Right channel time-domain bytes for stereo meter. */
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  /** Frequency bins for spectrum (master bus). */
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  /** Per-stem time-domain bytes for channel / lane metering. */
  getStemAnalyserTimeDomainData: (stemId: string) => Uint8Array | null;
  /** Master bus MediaStream for in-app recording. */
  getMasterRecordingStream: () => MediaStream | null;
  /** Master output gain, 0–1.5 (default 1.0 = 0 dB). */
  masterVolume: number;
  /** Set master output gain and update the live gain node immediately. */
  setMasterVolume: (value: number) => void;
  /** Master limiter state and setter (true = engaged). */
  masterLimiterEnabled: boolean;
  setMasterLimiterEnabled: (enabled: boolean) => void;
  /** Apply master EQ params to live audio nodes. */
  applyMasterEq: (eq: import("../../types/masterBus").MasterEqState) => void;
  /** Apply master compressor params to live audio nodes. */
  applyMasterCompressor: (comp: import("../../types/masterBus").MasterCompressorState) => void;
  /** Whether loop playback is enabled. */
  loopEnabled: boolean;
  /** Toggle or set loop playback mode. */
  setLoopEnabled: (enabled: boolean) => void;
}

export interface UseAudioPlaybackOptions {
  onError?: (message: string) => void;
  /** Current stem states; when provided, live mixer node params update while the mix plays. */
  stemStates?: Record<string, StemEditorState>;
  /** Detected project BPM (beat grid) for tempo-synced delay on stem FX. */
  playbackBpm?: number | null;
  /** Global pitch shift in semitones applied to all stems (-12 to +12). */
  globalPitchSemitones?: number;
  /** Shared AudioContext ref (from StemMediaProvider). */
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

/** Apply global pitch offset to a set of stem states without mutating the originals. */
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

const TRIM_HOT_SWAP_DEBOUNCE_MS = 80;

export function useAudioPlayback(
  options: UseAudioPlaybackOptions = {},
): UseAudioPlaybackReturn {
  const {
    onError,
    stemStates: stemStatesProp,
    playbackBpm,
    globalPitchSemitones = 0,
    audioContextRef: sharedAudioContextRef,
  } = options;
  const playbackBpmRef = useRef(resolvePlaybackBpm(playbackBpm ?? undefined));
  useEffect(() => {
    playbackBpmRef.current = resolvePlaybackBpm(playbackBpm ?? undefined);
  }, [playbackBpm]);

  const globalPitchRef = useRef(globalPitchSemitones);
  useEffect(() => {
    globalPitchRef.current = globalPitchSemitones;
  }, [globalPitchSemitones]);

  // --- Sub-hooks ---
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
    sharedAudioContextRef
      ? { audioContextRef: sharedAudioContextRef }
      : {},
  );

  const {
    playheadPositionRef,
    getPlayheadPosition,
    subscribePlayheadPosition,
    emitPlayheadPosition,
    cancelPlayheadTracker,
    startPlayheadTracker,
  } = usePlayhead();

  // --- Local state ---
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [loadingPreviewStemId, setLoadingPreviewStemId] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const loopEnabledRef = useRef(false);

  const setLoopEnabledWrapped = useCallback((enabled: boolean) => {
    setLoopEnabled(enabled);
    loopEnabledRef.current = enabled;
  }, []);

  const currentPreviewRuntimeRef = useRef<MixStemRuntime | null>(null);
  const mixStemRuntimesRef = useRef<MixStemRuntime[]>([]);
  const isPlayingMixRef = useRef(false);
  const playStartTimeRef = useRef<number>(0);
  const mixDurationRef = useRef<number>(0);
  const isPlayingPreviewRef = useRef(false);
  const previewDurationRef = useRef<number>(0);
  const lastSplitResultStemsRef = useRef<StemResult[]>([]);
  const lastStemStatesRef = useRef<Record<string, StemEditorState>>({});
  const lastStemBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const lastSeekRestartAtRef = useRef<number>(0);
  const lastSeekPctRef = useRef<number>(0);
  const previewStemStateRef = useRef<StemEditorState>(defaultStemState());
  const previewBufferRef = useRef<AudioBuffer | null>(null);

  const prevMixRoutingSigRef = useRef<string>("");
  const prevMixTrimSigRef = useRef<string>("");
  const prevMixPitchTempoSigRef = useRef<string>("");
  const prevMixMuteSoloSigRef = useRef<string>("");
  const trimDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewStructSigRef = useRef<string>("");
  const prevPreviewTrimSigRef = useRef<string>("");

  const pluginPoolRef = useRef<Map<string, PitchTempoPlugin>>(new Map());
  const pluginAvailableRef = useRef<boolean | null>(null);

  // Generation counter to guard against concurrent async rebuild calls.
  // Incremented before each rebuild; stale calls bail out when generation no longer matches.
  const rebuildGenerationRef = useRef(0);

  // --- Stop / cleanup helpers ---

  const stopPreview = useCallback(() => {
    if (currentPreviewRuntimeRef.current) {
      stopMixStemRuntime(currentPreviewRuntimeRef.current);
      currentPreviewRuntimeRef.current = null;
    }
    isPlayingPreviewRef.current = false;
    cancelPlayheadTracker();
    setPlayingStem(null);
  }, [cancelPlayheadTracker]);

  const handleStopMix = useCallback(() => {
    if (trimDebounceTimerRef.current) {
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
  }, [emitPlayheadPosition, cancelPlayheadTracker]);

  const stopMixSourcesPreservePlayhead = useCallback(() => {
    mixStemRuntimesRef.current.forEach(stopMixStemRuntime);
    mixStemRuntimesRef.current = [];
    cancelPlayheadTracker();
  }, [cancelPlayheadTracker]);

  // --- Keep seek + hot-swap in sync with latest UI state from the parent ---
  useEffect(() => {
    if (stemStatesProp) {
      lastStemStatesRef.current = stemStatesProp;
    }
  }, [stemStatesProp]);

  // --- Sync EQ/gain/effects on running mix and solo preview when sliders move (non-structural) ---
  useEffect(() => {
    if (!stemStatesProp) return;
    if (isPlayingMix) {
      for (const r of mixStemRuntimesRef.current) {
        const st = stemStatesProp[r.stemId];
        if (st) {
          r.dsp.update(st.mixer, Math.pow(10, st.mixer.gain / 20));
        }
      }
    }
    if (playingStem) {
      const r = currentPreviewRuntimeRef.current;
      if (r) {
        const st = stemStatesProp[r.stemId];
        if (st) {
          r.dsp.update(st.mixer, Math.pow(10, st.mixer.gain / 20));
        }
      }
    }
  }, [stemStatesProp, isPlayingMix, playingStem]);

  const attachMixSourceEnded = useCallback(
    (
      source: AudioBufferSourceNode,
      dsp: StemDspChain,
      onMixFullyStopped: () => void,
    ) => {
      source.onended = () => {
        dsp.disconnect();
        mixStemRuntimesRef.current = mixStemRuntimesRef.current.filter(
          (x) => x.source !== source,
        );
        if (mixStemRuntimesRef.current.length === 0) {
          if (loopEnabledRef.current && isPlayingMixRef.current) {
            // Loop: restart from the beginning
            const stemStates = lastStemStatesRef.current;
            void rebuildMixAtPctRef.current(0, stemStates);
          } else {
            cancelPlayheadTracker();
            emitPlayheadPosition(100);
            setIsPlayingMix(false);
            isPlayingMixRef.current = false;
            onMixFullyStopped();
          }
        }
      };
    },
    [cancelPlayheadTracker, emitPlayheadPosition],
  );

  // --- Rebuild mix at a given playhead percentage ---

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

      const masterWall = maxTrimWallDurationSeconds(stemsToPlay, stemBuffers, stemStates, pluginAvailableRef.current === true);
      if (masterWall <= 0) return;

      stopMixSourcesPreservePlayhead();

      const elapsedWall = (masterWall * pct) / 100;
      mixDurationRef.current = masterWall;
      emitPlayheadPosition(pct);
      playStartTimeRef.current = context.currentTime - elapsedWall;

      const runtimes: MixStemRuntime[] = [];
      for (const stem of stemsToPlay) {
        const buffer = stemBuffers[stem.id];
        if (!buffer) continue;
        const st = stemStates[stem.id] ?? defaultStemState();
        const plugin = await getOrCreatePlugin({
          context,
          stemId: stem.id,
          pool: pluginPoolRef.current,
          pluginAvailableRef,
        });
        const usePlugin = plugin !== null && stemNeedsPlugin(st);
        const stemWallDuration = getStemTrimWallDurationSeconds(buffer, st, usePlugin);
        const runtime = createMixRuntime({
          context,
          stemId: stem.id,
          buffer,
          stemState: st,
          plugin,
          usePlugin,
          elapsedWall,
          stemWallDuration,
          ensureMasterBus,
          bpm: playbackBpmRef.current,
        });
        if (!runtime) continue;
        attachMixSourceEnded(runtime.source, runtime.dsp, () => {
          prevMixRoutingSigRef.current = "";
          prevMixTrimSigRef.current = "";
        });
        runtimes.push(runtime);
      }

      if (runtimes.length === 0) {
        handleStopMix();
        return;
      }

      // If a newer rebuild raced ahead and already committed, bail out to avoid
      // overwriting its sources and leaking the previous generation's graph.
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
      getOrCreateContext,
      handleStopMix,
      stopMixSourcesPreservePlayhead,
      emitPlayheadPosition,
      ensureMasterBus,
      attachMixSourceEnded,
      startPlayheadTracker,
    ],
  );

  const rebuildMixAtPctRef = useRef(rebuildMixAtPct);
  // eslint-disable-next-line react-hooks/immutability, react-hooks/refs -- sync ref with latest callback for effects
  rebuildMixAtPctRef.current = rebuildMixAtPct;

  // --- Hot-swap mix when routing (mute/solo/pitch/stretch) or trim changes during playback ---
  useEffect(() => {
    if (!isPlayingMix || !stemStatesProp || !isPlayingMixRef.current) return;
    const split = lastSplitResultStemsRef.current;
    if (split.length === 0) return;

    const ids = split.map((s) => s.id);
    const routing = stemRoutingSignature(stemStatesProp, ids);
    const trimOnly = stemTrimSignature(stemStatesProp, ids);

    const pitchTempoSig = stemPitchTempoSignature(stemStatesProp, ids);
    const muteSoloSig = stemMuteSoloSignature(stemStatesProp, ids);

    const pitchTempoChanged = pitchTempoSig !== prevMixPitchTempoSigRef.current;
    const muteSoloChanged = muteSoloSig !== prevMixMuteSoloSigRef.current;

    const routingChanged = routing !== prevMixRoutingSigRef.current;
    const trimChanged = trimOnly !== prevMixTrimSigRef.current;

    if (!routingChanged && !trimChanged) return;

    // If only pitch/tempo changed and plugin is active, try in-place update.
    // However, if any stem transitioned from "no plugin needed" to "plugin needed"
    // (or vice versa), we must do a full rebuild because the audio graph topology changed.
    if (pitchTempoChanged && !muteSoloChanged && pluginAvailableRef.current === true) {
      const needsRebuild = mixStemRuntimesRef.current.some((r) => {
        const st = stemStatesProp[r.stemId];
        if (!st) return false;
        // Check if the stem's plugin-need state matches its current wiring.
        // r.plugin is non-null if a plugin was created, but buildStemSource only
        // wires it when stemNeedsPlugin(st) is true. If the need changed, rebuild.
        const nowNeeds = stemNeedsPlugin(st);
        // If plugin is wired (source → plugin → dsp), the source's playbackRate is 1.0.
        // If plugin is bypassed (source → dsp directly), playbackRate = effectiveRate.
        const wasWired = r.source.playbackRate.value === 1.0 && r.plugin !== null;
        return nowNeeds !== wasWired;
      });

      if (!needsRebuild) {
        prevMixPitchTempoSigRef.current = pitchTempoSig;
        prevMixRoutingSigRef.current = routing; // keep routing sig in sync
        for (const r of mixStemRuntimesRef.current) {
          if (r.plugin) {
            const st = stemStatesProp[r.stemId];
            if (st) {
              r.plugin.setPitchSemitones(st.pitchSemitones);
              r.plugin.setTempoRatio(timeStretchToTempoRatio(st.timeStretch));
            }
          }
        }
        // Recalculate duration since tempo affects wall-clock time
        const stemBuffers = lastStemBuffersRef.current;
        const split2 = lastSplitResultStemsRef.current;
        const stemsToPlay = filterStemsForAudibleMix(split2, stemStatesProp);
        mixDurationRef.current = maxTrimWallDurationSeconds(stemsToPlay, stemBuffers, stemStatesProp, true);
        return; // Skip full rebuild
      }
      // Fall through to full rebuild below
    }

    // Update tracking refs for next comparison
    prevMixPitchTempoSigRef.current = pitchTempoSig;
    prevMixMuteSoloSigRef.current = muteSoloSig;

    if (routingChanged) {
      if (trimDebounceTimerRef.current) {
        clearTimeout(trimDebounceTimerRef.current);
        trimDebounceTimerRef.current = null;
      }
      prevMixRoutingSigRef.current = routing;
      prevMixTrimSigRef.current = trimOnly;
      const pct = playheadPositionRef.current;
      void rebuildMixAtPctRef.current(pct, stemStatesProp);
      return;
    }

    if (trimChanged) {
      if (trimDebounceTimerRef.current)
        clearTimeout(trimDebounceTimerRef.current);
      trimDebounceTimerRef.current = setTimeout(() => {
        trimDebounceTimerRef.current = null;
        const st = stemStatesProp;
        if (!st) return;
        prevMixTrimSigRef.current = stemTrimSignature(st, ids);
        prevMixRoutingSigRef.current = stemRoutingSignature(st, ids);
        const pct = playheadPositionRef.current;
        void rebuildMixAtPctRef.current(pct, st);
      }, TRIM_HOT_SWAP_DEBOUNCE_MS);
    }
  }, [stemStatesProp, isPlayingMix, playheadPositionRef]);

  // --- Play mix ---
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
      stopPreview();

      const gp = globalPitchRef.current;
      const effectiveStemStates = gp !== 0 ? withGlobalPitch(stemStates, gp) : stemStates;

      const stemsToPlay = filterStemsForAudibleMix(splitResultStems, effectiveStemStates);
      if (stemsToPlay.length === 0) return;

      lastSplitResultStemsRef.current = splitResultStems;
      lastStemStatesRef.current = effectiveStemStates;
      lastStemBuffersRef.current = stemBuffers;

      const ids = splitResultStems.map((s) => s.id);
      prevMixRoutingSigRef.current = stemRoutingSignature(effectiveStemStates, ids);
      prevMixTrimSigRef.current = stemTrimSignature(effectiveStemStates, ids);
      prevMixPitchTempoSigRef.current = stemPitchTempoSignature(effectiveStemStates, ids);
      prevMixMuteSoloSigRef.current = stemMuteSoloSignature(effectiveStemStates, ids);

      const context = await getOrCreateContext();
      if (!context) return;

      await rebuildMixAtPct(0, effectiveStemStates);
    },
    [
      isPlayingMix,
      handleStopMix,
      stopPreview,
      getOrCreateContext,
      rebuildMixAtPct,
    ],
  );

  // --- Preview seek ---
  const seekToPreview = useCallback(
    async (pct: number) => {
      const gen = ++rebuildGenerationRef.current;
      const stemId = playingStem;
      if (!stemId) return;

      const context = await getOrCreateContext();
      if (!context) return;

      const buffer = previewBufferRef.current ?? lastStemBuffersRef.current[stemId];
      if (!buffer) return;

      const st =
        previewStemStateRef.current ??
        lastStemStatesRef.current[stemId] ??
        defaultStemState();

      const plugin = await getOrCreatePlugin({
        context,
        stemId,
        pool: pluginPoolRef.current,
        pluginAvailableRef,
      });
      const usePlugin = plugin !== null && stemNeedsPlugin(st);

      const wallDuration = getStemTrimWallDurationSeconds(buffer, st, usePlugin);
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
        return;
      }

      const runtime = createPreviewRuntime({
        context,
        stemId,
        buffer,
        stemState: st,
        plugin,
        usePlugin,
        wallDuration,
        wallElapsed,
        ensureMasterBus,
        bpm: playbackBpmRef.current,
      });
      if (!runtime) {
        emitPlayheadPosition(pct);
        setPlayingStem(null);
        return;
      }

      // If a newer seek raced ahead, bail out to avoid stale preview wiring.
      if (gen !== rebuildGenerationRef.current) {
        stopMixStemRuntime(runtime);
        return;
      }

      // Commit refs after generation guard so stale calls never overwrite shared state.
      previewDurationRef.current = wallRemaining;
      emitPlayheadPosition(pct);
      playheadPositionRef.current = pct;
      previewStemStateRef.current = st;
      previewBufferRef.current = buffer;

      runtime.source.onended = () => {
        runtime.dsp.disconnect();
        if (loopEnabledRef.current && isPlayingPreviewRef.current) {
          // Loop: restart preview from the beginning
          currentPreviewRuntimeRef.current = null;
          void seekToPreviewRef.current(0);
        } else {
          cancelPlayheadTracker();
          emitPlayheadPosition(100);
          if (currentPreviewRuntimeRef.current?.source === runtime.source) {
            currentPreviewRuntimeRef.current = null;
            isPlayingPreviewRef.current = false;
            setPlayingStem(null);
          }
        }
      };
      currentPreviewRuntimeRef.current = runtime;
      isPlayingPreviewRef.current = true;
      setPlayingStem(stemId);

      playStartTimeRef.current = context.currentTime - wallElapsed;

      startPlayheadTracker(
        context,
        previewDurationRef.current,
        playStartTimeRef.current,
        () => isPlayingPreviewRef.current,
      );
    },
    [
      playingStem,
      getOrCreateContext,
      cancelPlayheadTracker,
      emitPlayheadPosition,
      ensureMasterBus,
      startPlayheadTracker,
      playheadPositionRef,
    ],
  );

  const seekToPreviewRef = useRef(seekToPreview);
  // eslint-disable-next-line react-hooks/immutability, react-hooks/refs -- sync ref with latest callback for effects
  seekToPreviewRef.current = seekToPreview;

  // --- Hot-swap preview when pitch/stretch/trim change for the playing stem ---
  useEffect(() => {
    if (!playingStem || !stemStatesProp) return;
    if (!currentPreviewRuntimeRef.current) return;
    const st = stemStatesProp[playingStem];
    if (!st) return;

    const sig = stemPreviewStructuralSignature(st);
    if (sig === prevPreviewStructSigRef.current) return;
    prevPreviewStructSigRef.current = sig;

    const trimSig = `${st.trim.start}:${st.trim.end}`;
    const trimChanged = trimSig !== prevPreviewTrimSigRef.current;
    prevPreviewTrimSigRef.current = trimSig;

    previewStemStateRef.current = st;

    // If plugin active and only pitch/tempo changed (not trim), try in-place update.
    // Must verify the plugin is actually wired into the graph (not bypassed at defaults).
    const runtime = currentPreviewRuntimeRef.current;
    const pluginIsWired = runtime.plugin && runtime.source.playbackRate.value === 1.0;
    const nowNeedsPlugin = stemNeedsPlugin(st);

    if (!trimChanged && pluginIsWired && nowNeedsPlugin && pluginAvailableRef.current === true) {
      runtime.plugin!.setPitchSemitones(st.pitchSemitones);
      runtime.plugin!.setTempoRatio(timeStretchToTempoRatio(st.timeStretch));
      return; // Skip expensive seek rebuild
    }

    // Trim changed, plugin wiring mismatch, or no plugin — do full seek
    const pct = playheadPositionRef.current;
    void seekToPreviewRef.current(pct);
  }, [stemStatesProp, playingStem, playheadPositionRef]);

  // --- Seek (mix or preview) ---
  const seekToMixPosition = useCallback(
    async (pct: number, phase: SeekPhase = "end") => {
      const splitResultStems = lastSplitResultStemsRef.current;
      if (splitResultStems.length === 0) {
        emitPlayheadPosition(pct);
        return;
      }

      if (!isPlayingMixRef.current) {
        emitPlayheadPosition(pct);
        return;
      }

      const skipThrottle = phase === "end";
      if (!skipThrottle) {
        const now = Date.now();
        const pctDiff = Math.abs(pct - lastSeekPctRef.current);
        if (pctDiff < 0.75 && now - lastSeekRestartAtRef.current < 250) return;
        lastSeekPctRef.current = pct;
        lastSeekRestartAtRef.current = now;
      } else {
        lastSeekPctRef.current = pct;
        lastSeekRestartAtRef.current = Date.now();
      }

      const stemStates = stemStatesProp ?? lastStemStatesRef.current;
      await rebuildMixAtPct(pct, stemStates);
    },
    [emitPlayheadPosition, rebuildMixAtPct, stemStatesProp],
  );

  const handleSeekMix = useCallback(
    (pct: number, opts?: { phase?: SeekPhase }) => {
      const clampedPct = Math.max(0, Math.min(100, pct));
      const phase = opts?.phase ?? "end";
      if (playingStem) {
        void seekToPreview(clampedPct);
      } else {
        void seekToMixPosition(clampedPct, phase);
      }
    },
    [playingStem, seekToPreview, seekToMixPosition],
  );

  // --- Preview stem ---
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
      handleStopMix();
      stopPreview();
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
          lastStemStatesRef.current[stemId] ??
          defaultStemState();

        const plugin = await getOrCreatePlugin({
          context,
          stemId,
          pool: pluginPoolRef.current,
          pluginAvailableRef,
        });
        const usePlugin = plugin !== null && stemNeedsPlugin(st);

        const wallDuration = getStemTrimWallDurationSeconds(buffer, st, usePlugin);
        if (wallDuration <= 0) return;

        const startPct = Math.max(0, Math.min(100, playheadPositionRef.current));
        const wallElapsed = (wallDuration * startPct) / 100;
        const wallRemaining = wallDuration - wallElapsed;
        if (wallRemaining <= 0) {
          emitPlayheadPosition(startPct);
          return;
        }

        const runtime = createPreviewRuntime({
          context,
          stemId,
          buffer,
          stemState: st,
          plugin,
          usePlugin,
          wallDuration,
          wallElapsed,
          ensureMasterBus,
          bpm: playbackBpmRef.current,
        });
        if (!runtime) {
          emitPlayheadPosition(startPct);
          return;
        }
        runtime.source.onended = () => {
          runtime.dsp.disconnect();
          if (loopEnabledRef.current && isPlayingPreviewRef.current) {
            // Loop: restart preview from the beginning
            currentPreviewRuntimeRef.current = null;
            void seekToPreviewRef.current(0);
          } else {
            cancelPlayheadTracker();
            emitPlayheadPosition(100);
            if (currentPreviewRuntimeRef.current?.source === runtime.source) {
              currentPreviewRuntimeRef.current = null;
              isPlayingPreviewRef.current = false;
              setPlayingStem(null);
              prevPreviewStructSigRef.current = "";
              prevPreviewTrimSigRef.current = "";
            }
          }
        };
        // If a newer preview raced ahead and committed, bail out to avoid
        // overwriting its runtime and leaking the previous generation's graph.
        if (gen !== rebuildGenerationRef.current) {
          stopMixStemRuntime(runtime);
          return;
        }

        // Commit refs after generation guard so stale calls never overwrite shared state.
        previewStemStateRef.current = st;
        previewBufferRef.current = buffer;
        prevPreviewStructSigRef.current = stemPreviewStructuralSignature(st);
        prevPreviewTrimSigRef.current = `${st.trim.start}:${st.trim.end}`;
        emitPlayheadPosition(startPct);
        previewDurationRef.current = wallRemaining;
        playStartTimeRef.current = context.currentTime - wallElapsed;

        currentPreviewRuntimeRef.current = runtime;
        isPlayingPreviewRef.current = true;

        startPlayheadTracker(
          context,
          previewDurationRef.current,
          playStartTimeRef.current,
          () => isPlayingPreviewRef.current,
        );

        setPlayingStem(stemId);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Preview failed:", err);
        onError?.("Preview failed. Please try again.");
        setPlayingStem(null);
        prevPreviewStructSigRef.current = "";
        prevPreviewTrimSigRef.current = "";
      } finally {
        setLoadingPreviewStemId(null);
      }
    },
    [
      playingStem,
      getOrCreateContext,
      handleStopMix,
      stopPreview,
      onError,
      cancelPlayheadTracker,
      startPlayheadTracker,
      loadingPreviewStemId,
      emitPlayheadPosition,
      ensureMasterBus,
      playheadPositionRef,
    ],
  );

  const getStemAnalyserTimeDomainData = useCallback(
    (stemId: string): Uint8Array | null =>
      getStemAnalyserFromRuntimes({
        currentPreviewRuntimeRef,
        mixStemRuntimesRef,
        stemId,
      }),
    [],
  );

  // --- Cleanup on unmount ---
  useEffect(() => {
    const pool = pluginPoolRef.current;
    return () => {
      stopPreview();
      handleStopMix();
      destroyAllPlugins(pool);
      destroyContext();
    };
  }, [handleStopMix, stopPreview, destroyContext]);

  // eslint-disable-next-line react-hooks/refs -- expose ref snapshots in return value for consumers
  return {
    isPlayingMix,
    isPlayingMixRef,
    playingStem,
    loadingPreviewStemId,
    // eslint-disable-next-line react-hooks/refs -- expose current playhead position snapshot
    playheadPosition: playheadPositionRef.current,
    getPlayheadPosition,
    subscribePlayheadPosition,
    audioContextRef,
    handlePlayMix,
    handleSeekMix,
    handleStopMix,
    handlePreviewStem,
    stopPreview,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    getStemAnalyserTimeDomainData,
    getMasterRecordingStream,
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
