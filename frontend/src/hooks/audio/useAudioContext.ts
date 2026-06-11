/**
 * useAudioContext — AudioContext lifecycle + master bus (gain, EQ, compressor, limiter, analyser).
 *
 * Owns the singleton AudioContext and the master output chain:
 *   masterGain → [EQ: lowShelf → midPeak → highShelf] → [compressor?] → [limiter?] → analyser → destination
 *                                                                                    → splitter → left/right analysers
 */
import { useCallback, useRef, useState } from "react";
import { useMasterProcessingStore } from "./useMasterProcessing";
import type { MasterEqState, MasterCompressorState } from "../../types/masterBus";

export interface MasterProcessingRefs {
  masterEqLowRef: React.MutableRefObject<BiquadFilterNode | null>;
  masterEqMidRef: React.MutableRefObject<BiquadFilterNode | null>;
  masterEqHighRef: React.MutableRefObject<BiquadFilterNode | null>;
  masterCompressorRef: React.MutableRefObject<DynamicsCompressorNode | null>;
}

export interface MasterBusRefs {
  masterGainRef: React.MutableRefObject<GainNode | null>;
  masterAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
  masterLimiterRef: React.MutableRefObject<DynamicsCompressorNode | null>;
  masterSplitterRef: React.MutableRefObject<ChannelSplitterNode | null>;
  masterAnalyserLeftRef: React.MutableRefObject<AnalyserNode | null>;
  masterAnalyserRightRef: React.MutableRefObject<AnalyserNode | null>;
  masterLimiterEnabledRef: React.MutableRefObject<boolean>;
  masterStreamDestRef: React.MutableRefObject<MediaStreamAudioDestinationNode | null>;
  masterProcessingRefs: MasterProcessingRefs;
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
  /** Apply master EQ params to live nodes (call when store changes). */
  applyMasterEq: (eq: MasterEqState) => void;
  /** Apply master compressor params to live nodes (call when store changes). */
  applyMasterCompressor: (comp: MasterCompressorState) => void;
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
  /** Provider ref object (stable); mutations go through assignContextInstance, not options alias. */
  const sharedAudioRef = useRef(options.audioContextRef);

  const getContextInstance = (): AudioContext | null => {
    const external = sharedAudioRef.current;
    if (external) return external.current;
    return internalAudioContextRef.current;
  };

  const assignContextInstance = (ctx: AudioContext | null) => {
    const external = sharedAudioRef.current;
    if (external) external.current = ctx;
    else internalAudioContextRef.current = ctx;
  };

  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const masterSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const masterAnalyserLeftRef = useRef<AnalyserNode | null>(null);
  const masterAnalyserRightRef = useRef<AnalyserNode | null>(null);
  const masterLimiterEnabledRef = useRef(false);
  const masterStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Master processing chain refs (EQ + compressor)
  const masterEqLowRef = useRef<BiquadFilterNode | null>(null);
  const masterEqMidRef = useRef<BiquadFilterNode | null>(null);
  const masterEqHighRef = useRef<BiquadFilterNode | null>(null);
  const masterCompressorRef = useRef<DynamicsCompressorNode | null>(null);

  const reconnectMasterBus = useCallback((ctx: AudioContext) => {
    const g = masterGainRef.current;
    const an = masterAnalyserRef.current;
    const limiter = masterLimiterRef.current;
    const splitter = masterSplitterRef.current;
    const left = masterAnalyserLeftRef.current;
    const right = masterAnalyserRightRef.current;
    const eqLow = masterEqLowRef.current;
    const eqMid = masterEqMidRef.current;
    const eqHigh = masterEqHighRef.current;
    const comp = masterCompressorRef.current;
    if (!g || !an || !limiter || !splitter || !left || !right) return;

    try {
      g.disconnect();
      limiter.disconnect();
      an.disconnect();
      splitter.disconnect();
      left.disconnect();
      right.disconnect();
      eqLow?.disconnect();
      eqMid?.disconnect();
      eqHigh?.disconnect();
      comp?.disconnect();
    } catch {
      /* graph may already be disconnected */
    }

    // Build chain: masterGain → EQ → Compressor → [limiter?] → analyser → destination
    // EQ is always in the chain (gains at 0 = transparent), compressor bypasses via ratio=1
    let lastNode: AudioNode = g;

    if (eqLow && eqMid && eqHigh) {
      lastNode.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      lastNode = eqHigh;
    }

    if (comp) {
      lastNode.connect(comp);
      lastNode = comp;
    }

    const limiterEnabled = masterLimiterEnabledRef.current;
    if (limiterEnabled) {
      lastNode.connect(limiter);
      limiter.connect(an);
      limiter.connect(splitter);
    } else {
      lastNode.connect(an);
      lastNode.connect(splitter);
    }

    splitter.connect(left, 0);
    splitter.connect(right, 1);
    an.connect(ctx.destination);

    // Tap master output to MediaStreamDestination for recording
    const dest = masterStreamDestRef.current;
    if (dest) {
      // Tap post-processing for recording (captures EQ/comp/limiter)
      an.connect(dest);
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

      // Master processing: 3-band EQ + compressor
      const eqLow = ctx.createBiquadFilter();
      eqLow.type = "lowshelf";
      eqLow.frequency.value = 150;
      eqLow.gain.value = 0;

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = "peaking";
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1.0;
      eqMid.gain.value = 0;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = "highshelf";
      eqHigh.frequency.value = 4000;
      eqHigh.gain.value = 0;

      const comp = ctx.createDynamicsCompressor();
      // Initialize compressor to transparent pass-through (ratio=1 means no compression)
      comp.threshold.value = 0;
      comp.ratio.value = 1;
      comp.knee.value = 6;
      comp.attack.value = 0.01;
      comp.release.value = 0.15;

      // Apply any persisted state from the store
      const storeState = useMasterProcessingStore.getState();
      if (storeState.eq.enabled) {
        eqLow.gain.value = storeState.eq.lowGain;
        eqMid.gain.value = storeState.eq.midGain;
        eqHigh.gain.value = storeState.eq.highGain;
      }
      if (storeState.compressor.enabled) {
        comp.threshold.value = storeState.compressor.threshold;
        comp.ratio.value = storeState.compressor.ratio;
        comp.attack.value = storeState.compressor.attack;
        comp.release.value = storeState.compressor.release;
      }

      masterGainRef.current = g;
      masterLimiterRef.current = limiter;
      masterAnalyserRef.current = an;
      masterSplitterRef.current = splitter;
      masterAnalyserLeftRef.current = left;
      masterAnalyserRightRef.current = right;
      masterStreamDestRef.current = streamDest;
      masterEqLowRef.current = eqLow;
      masterEqMidRef.current = eqMid;
      masterEqHighRef.current = eqHigh;
      masterCompressorRef.current = comp;

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

  const setMasterLimiterEnabled = useCallback(
    (enabled: boolean) => {
      const next = Boolean(enabled);
      masterLimiterEnabledRef.current = next;
      setMasterLimiterEnabledState(next);
      const ctx = getContextInstance();
      if (ctx) reconnectMasterBus(ctx);
    },
    [reconnectMasterBus],
  );

  const applyMasterEq = useCallback((eq: MasterEqState) => {
    const low = masterEqLowRef.current;
    const mid = masterEqMidRef.current;
    const high = masterEqHighRef.current;
    if (!low || !mid || !high) return;
    low.gain.value = eq.enabled ? eq.lowGain : 0;
    mid.gain.value = eq.enabled ? eq.midGain : 0;
    high.gain.value = eq.enabled ? eq.highGain : 0;
  }, []);

  const applyMasterCompressor = useCallback((comp: MasterCompressorState) => {
    const node = masterCompressorRef.current;
    if (!node) return;
    if (comp.enabled) {
      node.threshold.value = comp.threshold;
      node.ratio.value = comp.ratio;
      node.attack.value = comp.attack;
      node.release.value = comp.release;
    } else {
      // Bypass: transparent pass-through
      node.threshold.value = 0;
      node.ratio.value = 1;
      node.attack.value = 0.003;
      node.release.value = 0.25;
    }
  }, []);

  const getOrCreateContext = useCallback(async (): Promise<AudioContext | null> => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;
    const existing = getContextInstance();
    if (!existing || existing.state === "closed") {
      masterGainRef.current = null;
      masterAnalyserRef.current = null;
      masterLimiterRef.current = null;
      masterSplitterRef.current = null;
      masterAnalyserLeftRef.current = null;
      masterAnalyserRightRef.current = null;
      masterStreamDestRef.current = null;
      masterEqLowRef.current = null;
      masterEqMidRef.current = null;
      masterEqHighRef.current = null;
      masterCompressorRef.current = null;
      assignContextInstance(new AudioContextCtor());
    }
    const ctx = getContextInstance();
    if (!ctx) return null;
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
    const ctx = getContextInstance();
    if (!ctx) return;
    try {
      ctx.close();
    } catch {
      /* ignore close errors during unmount */
    }
    assignContextInstance(null);
    masterGainRef.current = null;
    masterAnalyserRef.current = null;
    masterLimiterRef.current = null;
    masterSplitterRef.current = null;
    masterAnalyserLeftRef.current = null;
    masterAnalyserRightRef.current = null;
    masterStreamDestRef.current = null;
    masterEqLowRef.current = null;
    masterEqMidRef.current = null;
    masterEqHighRef.current = null;
    masterCompressorRef.current = null;
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
    masterProcessingRefs: {
      masterEqLowRef,
      masterEqMidRef,
      masterEqHighRef,
      masterCompressorRef,
    },
  };

  const getMasterRecordingStream = useCallback((): MediaStream | null => {
    return masterStreamDestRef.current?.stream ?? null;
  }, []);

  const audioContextRef =
    options.audioContextRef ?? internalAudioContextRef;

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
    applyMasterEq,
    applyMasterCompressor,
    getMasterRecordingStream,
    destroyContext,
  };
}
