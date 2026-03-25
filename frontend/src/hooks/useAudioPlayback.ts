/**
 * useAudioPlayback — canonical real-time Web Audio mix + stem preview + playhead.
 * Master mix stem selection matches export via `filterStemsForAudibleMix` (single semantics).
 */
import { useCallback, useRef, useState } from "react";
import type { StemResult } from "../types";
import { trimToSeconds, createStemPreviewBuffer, createStemDspChain } from "../utils/audio";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { filterStemsForAudibleMix } from "../utils/stemAudibility";
import { createPitchShifter, needsPitchShift, type StemPitchShifter } from "../utils/pitchShift";
import type { StemId } from "../types";

/**
 * A playback handle that is either a native AudioBufferSourceNode (no pitch shift)
 * or a SoundTouch StemPitchShifter (pitch shift active). Both support .disconnect().
 */
type StemPlaybackHandle =
  | { kind: "native"; source: AudioBufferSourceNode; pitchShifter: null }
  | { kind: "pitched"; source: null; pitchShifter: StemPitchShifter };

/**
 * Creates the appropriate playback handle and wires it to dsp.input.
 * - No pitch: native AudioBufferSourceNode, playbackRate = timeStretch.
 * - Pitch != 0: SoundTouch PitchShifter (replaces source node entirely).
 */
function buildStemPlayback(
  ctx: AudioContext,
  buffer: AudioBuffer,
  st: StemEditorState,
  trimStart: number,
  trimEnd: number,
  dspInput: AudioNode
): StemPlaybackHandle {
  const semitones = st.pitchSemitones ?? 0;
  const stretch = st.timeStretch ?? 1;

  if (needsPitchShift(st)) {
    const shifter = createPitchShifter(ctx, buffer, semitones, stretch > 0 ? stretch : 1, trimStart);
    shifter.connect(dspInput);
    return { kind: "pitched", source: null, pitchShifter: shifter };
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = stretch > 0 ? stretch : 1;
  source.connect(dspInput);
  source.start(0, trimStart, trimEnd - trimStart);
  return { kind: "native", source, pitchShifter: null };
}

function stopHandle(handle: StemPlaybackHandle) {
  if (handle.kind === "native") {
    try { handle.source.stop(); } catch { /* already stopped */ }
    try { handle.source.disconnect(); } catch { /* already disconnected */ }
  } else {
    handle.pitchShifter.disconnect();
  }
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
  handleSeekMix: (pct: number) => void;
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
}

export function useAudioPlayback(options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn {
  const { onError } = options;
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentPreviewHandleRef = useRef<StemPlaybackHandle | null>(null);
  const mixHandleRefs = useRef<StemPlaybackHandle[]>([]);
  const isPlayingMixRef = useRef(false);
  const playheadIntervalRef = useRef<number | null>(null);
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

  const stopPreview = useCallback(() => {
    if (currentPreviewHandleRef.current) {
      stopHandle(currentPreviewHandleRef.current);
      currentPreviewHandleRef.current = null;
    }
    isPlayingPreviewRef.current = false;
    if (playheadIntervalRef.current) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
    setPlayingStem(null);
  }, []);

  const handleStopMix = useCallback(() => {
    mixHandleRefs.current.forEach(stopHandle);
    mixHandleRefs.current = [];
    setIsPlayingMix(false);
    isPlayingMixRef.current = false;
    if (playheadIntervalRef.current) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
    emitPlayheadPosition(0);
  }, [emitPlayheadPosition]);

  const stopMixSourcesPreservePlayhead = useCallback(() => {
    mixHandleRefs.current.forEach(stopHandle);
    mixHandleRefs.current = [];
    if (playheadIntervalRef.current) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
  }, []);

  const handlePlayMix = useCallback(async (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>
  ) => {
    if (isPlayingMix) { handleStopMix(); return; }
    stopPreview();

    const stemsToPlay = filterStemsForAudibleMix(splitResultStems, stemStates);
    if (stemsToPlay.length === 0) return;

    lastSplitResultStemsRef.current = splitResultStems;
    lastStemStatesRef.current = stemStates;
    lastStemBuffersRef.current = stemBuffers;

    const context = await getOrCreateContext();
    if (!context) return;

    const handles: StemPlaybackHandle[] = [];
    for (const stem of stemsToPlay) {
      const buffer = stemBuffers[stem.id];
      if (!buffer) continue;
      const st = stemStates[stem.id] ?? defaultStemState();
      const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);

      const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
      const handle = buildStemPlayback(context, buffer, st, trimStart, trimEnd, dsp.input);
      dsp.output.connect(ensureMasterBus(context));

      if (handle.kind === "native") {
        handle.source.onended = () => {
          dsp.disconnect();
          mixHandleRefs.current = mixHandleRefs.current.filter((h) => h !== handle);
          if (mixHandleRefs.current.length === 0) {
            setIsPlayingMix(false);
            isPlayingMixRef.current = false;
          }
        };
      }
      handles.push(handle);
    }

    mixHandleRefs.current = handles;
    setIsPlayingMix(true);
    isPlayingMixRef.current = true;

    // Playhead tracking
    const firstStem = stemsToPlay[0];
    const firstBuffer = stemBuffers[firstStem.id];
    if (firstBuffer) {
      const st = stemStates[firstStem.id] ?? defaultStemState();
      const { trimStart, trimEnd } = trimToSeconds(firstBuffer, st.trim);
      mixDurationRef.current = trimEnd - trimStart;
      playStartTimeRef.current = context.currentTime;
      const duration = mixDurationRef.current;
      const updatePlayhead = () => {
        if (duration <= 0) return;
        const elapsed = context.currentTime - playStartTimeRef.current;
        const progress = Math.min(100, (elapsed / duration) * 100);
        emitPlayheadPosition(progress);
        if (progress < 100 && isPlayingMixRef.current) {
          playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlayingMix, handleStopMix, stopPreview, getOrCreateContext, emitPlayheadPosition, ensureMasterBus]);

  const handleSeekMix = useCallback((pct: number) => {
    void (async () => {
      const clampedPct = Math.max(0, Math.min(100, pct));

      // Preview seeking: restart the single-stem "Hear" preview at pct.
      if (playingStem) {
        const context = await getOrCreateContext();
        if (!context) return;

        const buffer = previewBufferRef.current ?? lastStemBuffersRef.current[playingStem];
        if (!buffer) return;

        const st = previewStemStateRef.current ?? lastStemStatesRef.current[playingStem] ?? defaultStemState();
        const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
        const playDuration = trimEnd - trimStart;
        if (playDuration <= 0) return;

        stopPreview();
        const elapsed = (playDuration * clampedPct) / 100;
        const remaining = playDuration - elapsed;
        if (remaining <= 0) {
          emitPlayheadPosition(clampedPct);
          return;
        }

        previewDurationRef.current = playDuration;
        emitPlayheadPosition(clampedPct);
        playheadPositionRef.current = clampedPct;
        previewStemStateRef.current = st;
        previewBufferRef.current = buffer;

        const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
        const handle = buildStemPlayback(context, buffer, st, trimStart + elapsed, trimEnd, dsp.input);
        dsp.output.connect(ensureMasterBus(context));

        if (handle.kind === "native") {
          handle.source.onended = () => {
            dsp.disconnect();
            if (currentPreviewHandleRef.current?.kind === "native" &&
                currentPreviewHandleRef.current.source === handle.source) {
              currentPreviewHandleRef.current = null;
              isPlayingPreviewRef.current = false;
              setPlayingStem(null);
            }
          };
        }
        currentPreviewHandleRef.current = handle;
        isPlayingPreviewRef.current = true;

        playStartTimeRef.current = context.currentTime - elapsed;

        const updatePlayhead = () => {
          const nextDuration = previewDurationRef.current;
          if (nextDuration <= 0) return;
          const currentElapsed = context.currentTime - playStartTimeRef.current;
          const progress = Math.min(100, (currentElapsed / nextDuration) * 100);
          emitPlayheadPosition(progress);
          if (progress < 100 && isPlayingPreviewRef.current) {
            playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
          }
        };

        playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        return;
      }

      const lastSplitResultStems = lastSplitResultStemsRef.current;
      if (lastSplitResultStems.length === 0) {
        emitPlayheadPosition(clampedPct);
        return;
      }

      // If not playing, just update the playhead UI.
      if (!isPlayingMixRef.current) {
        emitPlayheadPosition(clampedPct);
        return;
      }

      // Throttle restarts: timeline drag can spam seeks.
      const now = Date.now();
      const pctDiff = Math.abs(clampedPct - lastSeekPctRef.current);
      if (pctDiff < 0.75 && now - lastSeekRestartAtRef.current < 250) return;
      lastSeekPctRef.current = clampedPct;
      lastSeekRestartAtRef.current = now;

      const context = await getOrCreateContext();
      if (!context) return;

      const splitResultStems = lastSplitResultStemsRef.current;
      const stemStates = lastStemStatesRef.current;
      const stemBuffers = lastStemBuffersRef.current;

      const stemsToPlay = filterStemsForAudibleMix(splitResultStems, stemStates);
      if (stemsToPlay.length === 0) {
        handleStopMix();
        return;
      }

      stopMixSourcesPreservePlayhead();

      const firstStem = stemsToPlay[0];
      const firstBuffer = stemBuffers[firstStem.id];
      if (!firstBuffer) return;

      const firstState = stemStates[firstStem.id] ?? defaultStemState();
      const { trimStart, trimEnd } = trimToSeconds(firstBuffer, firstState.trim);
      const duration = trimEnd - trimStart;
      if (duration <= 0) return;

      mixDurationRef.current = duration;
      const elapsed = (duration * clampedPct) / 100;

      emitPlayheadPosition(clampedPct);
      playStartTimeRef.current = context.currentTime - elapsed;

      const handles: StemPlaybackHandle[] = [];
      for (const stem of stemsToPlay) {
        const buffer = stemBuffers[stem.id];
        if (!buffer) continue;
        const st = stemStates[stem.id] ?? defaultStemState();
        const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
        const playDuration = trimEnd - trimStart;
        const remaining = playDuration - elapsed;
        if (remaining <= 0) continue;

        const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
        const handle = buildStemPlayback(context, buffer, st, trimStart + elapsed, trimEnd, dsp.input);
        dsp.output.connect(ensureMasterBus(context));

        if (handle.kind === "native") {
          handle.source.onended = () => {
            dsp.disconnect();
            mixHandleRefs.current = mixHandleRefs.current.filter((h) => h !== handle);
            if (mixHandleRefs.current.length === 0) {
              setIsPlayingMix(false);
              isPlayingMixRef.current = false;
            }
          };
        }
        handles.push(handle);
      }

      mixHandleRefs.current = handles;
      setIsPlayingMix(true);
      isPlayingMixRef.current = true;

      const updatePlayhead = () => {
        const nextDuration = mixDurationRef.current;
        if (nextDuration <= 0) return;
        const currentElapsed = context.currentTime - playStartTimeRef.current;
        const progress = Math.min(100, (currentElapsed / nextDuration) * 100);
        emitPlayheadPosition(progress);
        if (progress < 100 && isPlayingMixRef.current) {
          playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        }
      };

      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
    })();
  }, [
    getOrCreateContext,
    handleStopMix,
    stopMixSourcesPreservePlayhead,
    emitPlayheadPosition,
    playingStem,
    stopPreview,
    ensureMasterBus,
  ]);

  const handlePreviewStem = useCallback(async (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
    stemStates?: Record<string, StemEditorState>
  ) => {
    if (playingStem === stemId) { stopPreview(); return; }
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

      const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
      const playDuration = trimEnd - trimStart;
      if (playDuration <= 0) return;

      const startPct = Math.max(0, Math.min(100, playheadPositionRef.current));
      const elapsed = (playDuration * startPct) / 100;
      const remaining = playDuration - elapsed;
      if (remaining <= 0) {
        emitPlayheadPosition(startPct);
        return;
      }

      const dsp = createStemDspChain(context, st.mixer, Math.pow(10, st.mixer.gain / 20));
      const handle = buildStemPlayback(context, buffer, st, trimStart + elapsed, trimEnd, dsp.input);

      dsp.output.connect(ensureMasterBus(context));
      emitPlayheadPosition(startPct);
      previewDurationRef.current = playDuration;
      playStartTimeRef.current = context.currentTime - elapsed;

      if (handle.kind === "native") {
        handle.source.onended = () => {
          dsp.disconnect();
          if (currentPreviewHandleRef.current?.kind === "native" &&
              currentPreviewHandleRef.current.source === handle.source) {
            currentPreviewHandleRef.current = null;
            isPlayingPreviewRef.current = false;
            setPlayingStem(null);
          }
        };
      }
      currentPreviewHandleRef.current = handle;
      isPlayingPreviewRef.current = true;

      const updatePlayhead = () => {
        const nextDuration = previewDurationRef.current;
        if (nextDuration <= 0) return;
        const currentElapsed = context.currentTime - playStartTimeRef.current;
        const progress = Math.min(100, (currentElapsed / nextDuration) * 100);
        emitPlayheadPosition(progress);
        if (progress < 100 && isPlayingPreviewRef.current) {
          playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);

      setPlayingStem(stemId);
    } catch (err) {
      console.error("Preview failed:", err);
      onError?.("Preview failed. Please try again.");
      setPlayingStem(null);
    }
  }, [playingStem, stopPreview, getOrCreateContext, emitPlayheadPosition, ensureMasterBus]);

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
