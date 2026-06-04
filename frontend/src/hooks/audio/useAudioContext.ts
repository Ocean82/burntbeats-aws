/**
 * useAudioContext — AudioContext lifecycle + master bus (gain, analyser, limiter, stereo split).
 *
 * Owns the singleton AudioContext and the master output chain:
 *   masterGain → [limiter?] → analyser → destination
 *                            → splitter → left/right analysers
 */
import { useCallback, useRef, useState } from "react";

export interface MasterBusRefs {
  masterGainRef: React.MutableRefObject<GainNode | null>;
  masterAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
  masterLimiterRef: React.MutableRefObject<DynamicsCompressorNode | null>;
  masterSplitterRef: React.MutableRefObject<ChannelSplitterNode | null>;
  masterAnalyserLeftRef: React.MutableRefObject<AnalyserNode | null>;
  masterAnalyserRightRef: React.MutableRefObject<AnalyserNode | null>;
  masterLimiterEnabledRef: React.MutableRefObject<boolean>;
  masterStreamDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>;
}

export interface UseAudioContextReturn {
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  getOrCreateContext: () => Promise<AudioContext | null>;
  ensureMasterBus: (ctx: AudioContext) => GainNode;
  reconnectMasterBus: (ctx: AudioContext) => void;
  masterBusRefs: MasterBusRefs;
  /** Time-domain bytes for VU / RMS (master bus). */
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  /** Left channel time-domain bytes for stereo meter. */
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  /** Right channel time-domain bytes for stereo meter. */
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  /** Frequency bins for spectrum (master bus). */
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  /** Master output gain, 0–1.5 (default 1.0 = 0 dB). */
  masterVolume: number;
  /** Set master output gain and update the live gain node immediately. */
  setMasterVolume: (value: number) => void;
  /** Master limiter state and setter (true = engaged). */
  masterLimiterEnabled: boolean;
  setMasterLimiterEnabled: (enabled: boolean) => void;
  /** Get the master bus MediaStream for recording (MediaRecorder input). */
  getMasterRecordingStream: () => MediaStream | null;
  /** Tear down context and null all refs (for unmount). */
  destroyContext: () => void;
}

export interface UseAudioContextOptions {
  /** Shared decode/playback context (owned by StemMediaProvider). */
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

export function useAudioContext(
  options: UseAudioContextOptions = {},
): UseAudioContextReturn {
  const [masterVolume, setMasterVolumeState] = useState(1.0);
  const [masterLimiterEnabled, setMasterLimiterEnabledState] = useState(false);

  const internalAudioContextRef = useRef<AudioContext | null>(null);
  const audioContextRef = options.audioContextRef ?? internalAudioContextRef;
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const masterSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const masterAnalyserLeftRef = useRef<AnalyserNode | null>(null);
  const masterAnalyserRightRef = useRef<AnalyserNode | null>(null);
  const masterLimiterEnabledRef = useRef(false);
  const masterStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    const reconnectMasterBus = useCallback((ctx: AudioContext) => {
    const g = masterGainRef.current;
    const an = masterAnalyserRef.current;
    const limiter = masterLimiterRef.current;
    const splitter = masterSplitterRef.current;
    const left = masterAnalyserLeftRef.current;
    const right = masterAnalyserRightRef.current;
    if (!g || !an || !limiter || !splitter || !left || !right) return;

    try {
      g.disconnect();
      limiter.disconnect();
      an.disconnect();
      splitter.disconnect();
      left.disconnect();
      right.disconnect();
    } catch {
      /* graph may already be disconnected */
    }

    const limiterEnabled = masterLimiterEnabledRef.current;
    if (limiterEnabled) {
      g.connect(limiter);
      limiter.connect(an);
      limiter.connect(splitter);
    } else {
      g.connect(an);
      g.connect(splitter);
    }

    splitter.connect(left, 0);
    splitter.connect(right, 1);
    an.connect(ctx.destination);

    // Tap master output to MediaStreamDestination for recording
    const dest = masterStreamDestRef.current;
    if (dest) {
      g.connect(dest);
    }
  }, []);

  const ensureMasterBus = useCallback(
    (ctx: AudioContext): GainNode => {
      if (
        masterGainRef.current &&
        masterAnalyserRef.current &&
        masterLimiterRef.current &&
        masterSplitterRef.current &&
        masterAnalyserLeftRef.current &&
        masterAnalyserRightRef.current &&
        masterStreamDestRef.current
      ) {
        reconnectMasterBus(ctx);
        return masterGainRef.current;
      }

      const g = ctx.createGain();
      g.gain.value = 1;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.05;
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.85;
      const splitter = ctx.createChannelSplitter(2);
      const left = ctx.createAnalyser();
      left.fftSize = 2048;
      left.smoothingTimeConstant = 0.7;
      const right = ctx.createAnalyser();
      right.fftSize = 2048;
      right.smoothingTimeConstant = 0.7;
      const streamDest = ctx.createMediaStreamDestination();

      masterGainRef.current = g;
      masterLimiterRef.current = limiter;
      masterAnalyserRef.current = an;
      masterSplitterRef.current = splitter;
      masterAnalyserLeftRef.current = left;
      masterAnalyserRightRef.current = right;
      masterStreamDestRef.current = streamDest;
      reconnectMasterBus(ctx);
      return masterGainRef.current;
    },
    [reconnectMasterBus],
  );

  const getMasterAnalyserTimeDomainData = useCallback((): Uint8Array | null => {
    const an = masterAnalyserRef.current;
    if (!an) return null;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    return buf;
  }, []);

  const getMasterAnalyserTimeDomainDataLeft = useCallback((): Uint8Array | null => {
    const an = masterAnalyserLeftRef.current;
    if (!an) return null;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    return buf;
  }, []);

  const getMasterAnalyserTimeDomainDataRight = useCallback((): Uint8Array | null => {
    const an = masterAnalyserRightRef.current;
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

  const setMasterVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1.5, value));
    setMasterVolumeState(clamped);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = clamped;
    }
  }, []);

  const setMasterLimiterEnabled = useCallback((enabled: boolean) => {
    const next = Boolean(enabled);
    masterLimiterEnabledRef.current = next;
    setMasterLimiterEnabledState(next);
    const ctx = audioContextRef.current;
    if (ctx) reconnectMasterBus(ctx);
  }, [reconnectMasterBus]);

  const getOrCreateContext = useCallback(async (): Promise<AudioContext | null> => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;
    const existing = audioContextRef.current;
    if (!existing || existing.state === "closed") {
      masterGainRef.current = null;
      masterAnalyserRef.current = null;
      masterLimiterRef.current = null;
      masterSplitterRef.current = null;
      masterAnalyserLeftRef.current = null;
      masterAnalyserRightRef.current = null;
      masterStreamDestRef.current = null;
      audioContextRef.current = new AudioContextCtor();
    }
    const ctx = audioContextRef.current!;
    ensureMasterBus(ctx);
    if (ctx.state === "suspended") {
      await ctx.resume();
      // iOS Safari may not resume immediately — retry once after a short delay
      if (ctx.state === "suspended") {
        await new Promise((r) => setTimeout(r, 100));
        await ctx.resume();
      }
    }
    return ctx;
  }, [ensureMasterBus]);

  const destroyContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    try {
      ctx.close();
    } catch {
      /* ignore close errors during unmount */
    }
    audioContextRef.current = null;
    masterGainRef.current = null;
    masterAnalyserRef.current = null;
    masterLimiterRef.current = null;
    masterSplitterRef.current = null;
    masterAnalyserLeftRef.current = null;
    masterAnalyserRightRef.current = null;
    masterStreamDestRef.current = null;
  }, []);

  const masterBusRefs: MasterBusRefs = {
    masterGainRef,
    masterAnalyserRef,
    masterLimiterRef,
    masterSplitterRef,
    masterAnalyserLeftRef,
    masterAnalyserRightRef,
    masterLimiterEnabledRef,
    masterStreamDestRef,
  };

  const getMasterRecordingStream = useCallback((): MediaStream | null => {
    return masterStreamDestRef.current?.stream ?? null;
  }, []);

  return {
    audioContextRef,
    getOrCreateContext,
    ensureMasterBus,
    reconnectMasterBus,
    masterBusRefs,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    masterVolume,
    setMasterVolume,
    masterLimiterEnabled,
    setMasterLimiterEnabled,
    getMasterRecordingStream,
    destroyContext,
  };
}
