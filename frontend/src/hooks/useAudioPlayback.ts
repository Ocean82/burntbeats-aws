/**
 * useAudioPlayback — real-time Web Audio mix + stem preview + playhead.
 * Playback uses `playbackRate = getStemEffectiveRate(st)` so live preview matches client + server export.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { StemResult } from "../types";
import {
  createStemPreviewBuffer,
  createStemDspChain,
  getStemTrimWallDurationSeconds,
  maxTrimWallDurationSeconds,
  trimStartOffsetAtElapsedWall,
  type StemDspChain,
} from "../utils/audio";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../stem-editor-state";
import { filterStemsForAudibleMix } from "../utils/stemAudibility";
import { createPlayheadTracker } from "../utils/playheadTracker";
import {
  stemPreviewStructuralSignature,
  stemRoutingSignature,
  stemTrimSignature,
} from "../utils/stemPlaybackUtils";
import type { SeekPhase } from "../types/playbackSeek";
import type { StemId } from "../types";

export type { SeekPhase };

export type MixStemRuntime = {
  stemId: string;
  dsp: StemDspChain;
  source: AudioBufferSourceNode;
};

function buildStemSource(
  ctx: AudioContext,
  buffer: AudioBuffer,
  st: StemEditorState,
  trimStart: number,
  trimEnd: number,
  dspInput: AudioNode
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = getStemEffectiveRate(st);
  source.connect(dspInput);
  source.start(0, trimStart, trimEnd - trimStart);
  return source;
}

function stopMixStemRuntime(r: MixStemRuntime) {
  try {
    r.source.stop();
  } catch {
    /* already stopped */
  }
  try {
    r.source.disconnect();
  } catch {
    /* already disconnected */
  }
  r.dsp.disconnect();
}

interface UseAudioPlaybackReturn {
  isPlayingMix: boolean;
  isPlayingMixRef: React.MutableRefObject<boolean>;
  playingStem: string | null;
  playheadPosition: number;
  getPlayheadPosition: () => number;
  subscribePlayheadPosition: (listener: () => void) => () => void;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  handlePlayMix: (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>
  ) => Promise<void>;
  handleSeekMix: (pct: number, opts?: { phase?: SeekPhase }) => void;
  handleStopMix: () => void;
  handlePreviewStem: (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
    stemStates?: Record<string, StemEditorState>
  ) => Promise<void>;
  stopPreview: () => void;
  /** Time-domain bytes for VU / RMS (master bus). */
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  /** Frequency bins for spectrum (master bus). */
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
}

interface UseAudioPlaybackOptions {
  onError?: (message: string) => void;
  /** Current stem states; when provided, live mixer node params update while the mix plays. */
  stemStates?: Record<string, StemEditorState>;
}

const TRIM_HOT_SWAP_DEBOUNCE_MS = 80;

export function useAudioPlayback(options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn {
  const { onError, stemStates: stemStatesProp } = options;
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentPreviewRuntimeRef = useRef<MixStemRuntime | null>(null);
  const mixStemRuntimesRef = useRef<MixStemRuntime[]>([]);
  const isPlayingMixRef = useRef(false);
  const playheadIntervalRef = useRef<number | null>(null);
  const playheadTrackerStopRef = useRef<(() => void) | null>(null);
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
  const playheadPositionRef = useRef<number>(0);
  const playheadListenersRef = useRef<Set<() => void>>(new Set());
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);

  const prevMixRoutingSigRef = useRef<string>("");
  const prevMixTrimSigRef = useRef<string>("");
  const trimDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPreviewStructSigRef = useRef<string>("");

  const ensureMasterBus = useCallback((ctx: AudioContext): GainNode => {
    if (masterGainRef.current && masterAnalyserRef.current) {
      return masterGainRef.current;
    }
    const g = ctx.createGain();
    g.gain.value = 1;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.85;
    g.connect(an);
    an.connect(ctx.destination);
    masterGainRef.current = g;
    masterAnalyserRef.current = an;
    return g;
  }, []);

  const getMasterAnalyserTimeDomainData = useCallback((): Uint8Array | null => {
    const an = masterAnalyserRef.current;
    if (!an) return null;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    return buf;
  }, []);

  const getMasterAnalyserFrequencyData = useCallback((): Uint8Array | null => {
    const an = masterAnalyserRef.current;
    if (!an) return null;
    const buf = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf);
    return buf;
  }, []);

  const emitPlayheadPosition = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    if (Math.abs(playheadPositionRef.current - clamped) < 0.001) return;
    playheadPositionRef.current = clamped;
    playheadListenersRef.current.forEach((listener) => listener());
  }, []);

  const subscribePlayheadPosition = useCallback((listener: () => void) => {
    playheadListenersRef.current.add(listener);
    return () => {
      playheadListenersRef.current.delete(listener);
    };
  }, []);

  const getPlayheadPosition = useCallback(() => playheadPositionRef.current, []);

  const getOrCreateContext = useCallback(async (): Promise<AudioContext | null> => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const existing = audioContextRef.current;
    if (!existing || existing.state === "closed") {
      masterGainRef.current = null;
      masterAnalyserRef.current = null;
      audioContextRef.current = new AudioContextCtor();
    }
    const ctx = audioContextRef.current!;
    ensureMasterBus(ctx);
    await ctx.resume();
    return ctx;
  }, [ensureMasterBus]);

  const cancelPlayheadTracker = useCallback(() => {
    playheadTrackerStopRef.current?.();
    playheadTrackerStopRef.current = null;
    if (playheadIntervalRef.current !== null) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
  }, []);

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

  /** Keep seek + hot-swap in sync with latest UI state from the parent. */
  useEffect(() => {
    if (stemStatesProp) {
      lastStemStatesRef.current = stemStatesProp;
    }
  }, [stemStatesProp]);

  /** Sync EQ/gain/effects on running mix and solo preview when sliders move (non-structural). */
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
    (source: AudioBufferSourceNode, dsp: StemDspChain, onMixFullyStopped: () => void) => {
      source.onended = () => {
        dsp.disconnect();
        mixStemRuntimesRef.current = mixStemRuntimesRef.current.filter((x) => x.source !== source);
        if (mixStemRuntimesRef.current.length === 0) {
          cancelPlayheadTracker();
          emitPlayheadPosition(100);
          setIsPlayingMix(false);
          isPlayingMixRef.current = false;
          onMixFullyStopped();
        }
      };
    },
    [cancelPlayheadTracker, emitPlayheadPosition]
  );

  const startPlayheadTracker = useCallback(
    (context: AudioContext, duration: number, startTime: number, isActive: () => boolean) => {
      cancelPlayheadTracker();
      const tracker = createPlayheadTracker({
        context,
        duration,
        startTime,
        onUpdate: emitPlayheadPosition,
        isActive,
      });
      playheadTrackerStopRef.current = tracker.stop;
      playheadIntervalRef.current = tracker.start();
    },
    [cancelPlayheadTracker, emitPlayheadPosition]
  );

  /**
   * Rebuild all audible stems at `pct` (0–100) using current stem states + buffers.
   * Used by seek and by hot-swap when mute/solo/trim/pitch/stretch change during playback.
   */
  const rebuildMixAtPct = useCallback(
    async (pct: number, stemStates: Record<string, StemEditorState>) => {
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

      const masterWall = maxTrimWallDurationSeconds(stemsToPlay, stemBuffers, stemStates);
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
        const { trimEnd, startOffset } = trimStartOffsetAtElapsedWall(buffer, st, elapsedWall);
        if (trimEnd - startOffset <= 0) continue;

        const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
        const source = buildStemSource(context, buffer, st, startOffset, trimEnd, dsp.input);
        dsp.output.connect(ensureMasterBus(context));

        const runtime: MixStemRuntime = { stemId: stem.id, dsp, source };
        attachMixSourceEnded(source, dsp, () => {
          prevMixRoutingSigRef.current = "";
          prevMixTrimSigRef.current = "";
        });
        runtimes.push(runtime);
      }

      if (runtimes.length === 0) {
        handleStopMix();
        return;
      }

      mixStemRuntimesRef.current = runtimes;
      setIsPlayingMix(true);
      isPlayingMixRef.current = true;

      startPlayheadTracker(context, mixDurationRef.current, playStartTimeRef.current, () => isPlayingMixRef.current);
    },
    [
      getOrCreateContext,
      handleStopMix,
      stopMixSourcesPreservePlayhead,
      emitPlayheadPosition,
      ensureMasterBus,
      attachMixSourceEnded,
      startPlayheadTracker,
    ]
  );

  const rebuildMixAtPctRef = useRef(rebuildMixAtPct);
  rebuildMixAtPctRef.current = rebuildMixAtPct;

  /** Hot-swap mix when routing (mute/solo/pitch/stretch) or trim changes during playback. */
  useEffect(() => {
    if (!isPlayingMix || !stemStatesProp || !isPlayingMixRef.current) return;
    const split = lastSplitResultStemsRef.current;
    if (split.length === 0) return;

    const ids = split.map((s) => s.id);
    const routing = stemRoutingSignature(stemStatesProp, ids);
    const trimOnly = stemTrimSignature(stemStatesProp, ids);

    const routingChanged = routing !== prevMixRoutingSigRef.current;
    const trimChanged = trimOnly !== prevMixTrimSigRef.current;

    if (!routingChanged && !trimChanged) return;

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
      if (trimDebounceTimerRef.current) clearTimeout(trimDebounceTimerRef.current);
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
  }, [stemStatesProp, isPlayingMix]);

  const handlePlayMix = useCallback(
    async (
      splitResultStems: StemResult[],
      stemStates: Record<string, StemEditorState>,
      stemBuffers: Record<string, AudioBuffer>
    ) => {
      if (isPlayingMix) {
        handleStopMix();
        return;
      }
      stopPreview();

      const stemsToPlay = filterStemsForAudibleMix(splitResultStems, stemStates);
      if (stemsToPlay.length === 0) return;

      lastSplitResultStemsRef.current = splitResultStems;
      lastStemStatesRef.current = stemStates;
      lastStemBuffersRef.current = stemBuffers;

      const ids = splitResultStems.map((s) => s.id);
      prevMixRoutingSigRef.current = stemRoutingSignature(stemStates, ids);
      prevMixTrimSigRef.current = stemTrimSignature(stemStates, ids);

      const context = await getOrCreateContext();
      if (!context) return;

      await rebuildMixAtPct(0, stemStates);
    },
    [isPlayingMix, handleStopMix, stopPreview, getOrCreateContext, rebuildMixAtPct]
  );

  const seekToPreview = useCallback(
    async (pct: number) => {
      const stemId = playingStem;
      if (!stemId) return;

      const context = await getOrCreateContext();
      if (!context) return;

      const buffer = previewBufferRef.current ?? lastStemBuffersRef.current[stemId];
      if (!buffer) return;

      const st = previewStemStateRef.current ?? lastStemStatesRef.current[stemId] ?? defaultStemState();
      const wallDuration = getStemTrimWallDurationSeconds(buffer, st);
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

      const { trimEnd, startOffset } = trimStartOffsetAtElapsedWall(buffer, st, wallElapsed);
      if (trimEnd - startOffset <= 0) {
        emitPlayheadPosition(pct);
        setPlayingStem(null);
        return;
      }

      previewDurationRef.current = wallRemaining;
      emitPlayheadPosition(pct);
      playheadPositionRef.current = pct;
      previewStemStateRef.current = st;
      previewBufferRef.current = buffer;

      const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
      const source = buildStemSource(context, buffer, st, startOffset, trimEnd, dsp.input);
      dsp.output.connect(ensureMasterBus(context));

      const runtime: MixStemRuntime = { stemId, dsp, source };
      source.onended = () => {
        dsp.disconnect();
        cancelPlayheadTracker();
        emitPlayheadPosition(100);
        if (currentPreviewRuntimeRef.current?.source === source) {
          currentPreviewRuntimeRef.current = null;
          isPlayingPreviewRef.current = false;
          setPlayingStem(null);
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
        () => isPlayingPreviewRef.current
      );
    },
    [playingStem, getOrCreateContext, cancelPlayheadTracker, emitPlayheadPosition, ensureMasterBus, startPlayheadTracker]
  );

  const seekToPreviewRef = useRef(seekToPreview);
  seekToPreviewRef.current = seekToPreview;

  /** Hot-swap preview when pitch/stretch/trim change for the playing stem. */
  useEffect(() => {
    if (!playingStem || !stemStatesProp) return;
    if (!currentPreviewRuntimeRef.current) return;
    const st = stemStatesProp[playingStem];
    if (!st) return;

    const sig = stemPreviewStructuralSignature(st);
    if (sig === prevPreviewStructSigRef.current) return;
    prevPreviewStructSigRef.current = sig;

    previewStemStateRef.current = st;
    const pct = playheadPositionRef.current;
    void seekToPreviewRef.current(pct);
  }, [stemStatesProp, playingStem]);

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
    [emitPlayheadPosition, rebuildMixAtPct, stemStatesProp]
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
    [playingStem, seekToPreview, seekToMixPosition]
  );

  const handlePreviewStem = useCallback(
    async (
      stemId: string,
      stemUrl: string | undefined,
      stemBuffers: Record<string, AudioBuffer>,
      setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
      stemStates?: Record<string, StemEditorState>
    ) => {
      if (playingStem === stemId) {
        stopPreview();
        prevPreviewStructSigRef.current = "";
        return;
      }
      stopPreview();

      const context = await getOrCreateContext();
      if (!context) return;

      try {
        let buffer: AudioBuffer;
        if (stemBuffers[stemId]) {
          buffer = stemBuffers[stemId];
        } else if (stemUrl) {
          const res = await fetch(stemUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching preview for ${stemId}`);
          buffer = await context.decodeAudioData(await res.arrayBuffer());
          setStemBuffers((b) => ({ ...b, [stemId]: buffer }));
        } else {
          buffer = createStemPreviewBuffer(context, stemId as StemId);
        }

        const st = stemStates?.[stemId] ?? lastStemStatesRef.current[stemId] ?? defaultStemState();
        previewStemStateRef.current = st;
        previewBufferRef.current = buffer;
        prevPreviewStructSigRef.current = stemPreviewStructuralSignature(st);

        const wallDuration = getStemTrimWallDurationSeconds(buffer, st);
        if (wallDuration <= 0) return;

        const startPct = Math.max(0, Math.min(100, playheadPositionRef.current));
        const wallElapsed = (wallDuration * startPct) / 100;
        const wallRemaining = wallDuration - wallElapsed;
        if (wallRemaining <= 0) {
          emitPlayheadPosition(startPct);
          return;
        }

        const { trimEnd, startOffset } = trimStartOffsetAtElapsedWall(buffer, st, wallElapsed);
        if (trimEnd - startOffset <= 0) {
          emitPlayheadPosition(startPct);
          return;
        }

        const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
        const source = buildStemSource(context, buffer, st, startOffset, trimEnd, dsp.input);

        dsp.output.connect(ensureMasterBus(context));
        emitPlayheadPosition(startPct);
        previewDurationRef.current = wallRemaining;
        playStartTimeRef.current = context.currentTime - wallElapsed;

        const runtime: MixStemRuntime = { stemId, dsp, source };
        source.onended = () => {
          dsp.disconnect();
          cancelPlayheadTracker();
          emitPlayheadPosition(100);
          if (currentPreviewRuntimeRef.current?.source === source) {
            currentPreviewRuntimeRef.current = null;
            isPlayingPreviewRef.current = false;
            setPlayingStem(null);
            prevPreviewStructSigRef.current = "";
          }
        };
        currentPreviewRuntimeRef.current = runtime;
        isPlayingPreviewRef.current = true;

        startPlayheadTracker(
          context,
          previewDurationRef.current,
          playStartTimeRef.current,
          () => isPlayingPreviewRef.current
        );

        setPlayingStem(stemId);
      } catch (err) {
        console.error("Preview failed:", err);
        onError?.("Preview failed. Please try again.");
        setPlayingStem(null);
        prevPreviewStructSigRef.current = "";
      }
    },
    [playingStem, stopPreview, getOrCreateContext, emitPlayheadPosition, ensureMasterBus, onError, cancelPlayheadTracker, startPlayheadTracker]
  );

  return {
    isPlayingMix,
    isPlayingMixRef,
    playingStem,
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
    getMasterAnalyserFrequencyData,
  };
}
