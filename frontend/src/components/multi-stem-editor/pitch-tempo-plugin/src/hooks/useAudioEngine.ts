/**
 * useAudioEngine — Core hook that manages the Web Audio graph,
 * AudioWorklet plugins, transport, and stem state.
 *
 * Designed to accept external AudioBuffers (from a stem splitter)
 * and optionally share an AudioContext with the parent app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchTempoPlugin } from '../dsp/PitchTempoPlugin';
import type { StemInput, StemState, StemMode, PitchTempoEngine } from '../types';

interface AudioNodes {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  plugin: PitchTempoPlugin;
}

export interface UseAudioEngineOptions {
  /** Stem inputs — when this changes, the engine re-initializes */
  stems: StemInput[];
  /** Optional shared AudioContext from parent app */
  audioContext?: AudioContext;
  /** Called when playback reaches the end */
  onPlaybackEnd?: () => void;
}

export function useAudioEngine(options: UseAudioEngineOptions): PitchTempoEngine {
  const { stems: inputStems, audioContext: externalCtx, onPlaybackEnd } = options;

  // Audio engine refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ownsContext = useRef(false);
  const nodesRef = useRef<Map<string, AudioNodes>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // State
  const [engineReady, setEngineReady] = useState(false);
  const [engineStatus, setEngineStatus] = useState('Initializing…');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [stemMode, setStemModeState] = useState<StemMode>('global');
  const [globalPitch, setGlobalPitchState] = useState(0);
  const [globalTempo, setGlobalTempoState] = useState(1.0);
  const [globalBypass, setGlobalBypassState] = useState(false);
  const [linked, setLinkedState] = useState(false);
  const [stems, setStems] = useState<StemState[]>([]);

  // Keep a ref to stems for use in callbacks that shouldn't re-create on every stem change
  const stemsRef = useRef<StemState[]>(stems);
  stemsRef.current = stems;

  // ── Initialize / re-initialize when input stems change ──────
  useEffect(() => {
    if (inputStems.length === 0) {
      setEngineStatus('No stems provided');
      return;
    }

    let ctx: AudioContext;
    let cancelled = false;

    const init = async () => {
      try {
        // Use external context or create our own
        if (externalCtx) {
          ctx = externalCtx;
          ownsContext.current = false;
        } else {
          ctx = new AudioContext({ sampleRate: 44100 });
          ownsContext.current = true;
        }
        audioCtxRef.current = ctx;

        // Master analyser
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.8;
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;

        if (cancelled) return;
        setEngineStatus('Loading AudioWorklet…');

        // Compute duration from longest buffer
        const maxDuration = Math.max(...inputStems.map(s => s.buffer.duration));
        setDuration(maxDuration);

        // Build stem state
        const initialStems: StemState[] = inputStems.map(s => ({
          id: s.id,
          label: s.label,
          emoji: s.emoji ?? '🎵',
          color: s.color,
          buffer: s.buffer,
          pitchSemitones: 0,
          tempoRatio: 1.0,
          muted: false,
          solo: false,
          bypass: false,
        }));
        setStems(initialStems);

        // Create plugin nodes for each stem
        // Clean up old nodes first
        nodesRef.current.forEach(n => {
          n.plugin.destroy();
          try { n.gainNode.disconnect(); } catch (_) {}
        });
        nodesRef.current.clear();

        for (const s of inputStems) {
          if (cancelled) return;
          const plugin = new PitchTempoPlugin({ audioContext: ctx });
          await plugin.ready();
          const gainNode = ctx.createGain();
          plugin.outputNode.connect(gainNode);
          gainNode.connect(analyser);
          nodesRef.current.set(s.id, { source: null, gainNode, plugin });
        }

        if (cancelled) return;
        setEngineReady(true);
        setEngineStatus('Ready');
      } catch (err) {
        console.error('[useAudioEngine] Init error:', err);
        setEngineStatus(`Error: ${err}`);
      }
    };

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      // Stop sources
      nodesRef.current.forEach(n => {
        if (n.source) {
          try { n.source.stop(); } catch (_) {}
          try { n.source.disconnect(); } catch (_) {}
        }
        n.plugin.destroy();
        try { n.gainNode.disconnect(); } catch (_) {}
      });
      nodesRef.current.clear();
      analyserRef.current = null;
      if (ownsContext.current && audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      setEngineReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
    };
  }, [inputStems, externalCtx]);

  // ── Playback tick ──────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx || !isPlaying) return;
      const elapsed = ctx.currentTime - startTimeRef.current + pauseOffsetRef.current;
      const t = Math.min(elapsed, duration);
      setCurrentTime(t);
      if (t >= duration) {
        setIsPlaying(false);
        setCurrentTime(0);
        pauseOffsetRef.current = 0;
        onPlaybackEnd?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, duration, onPlaybackEnd]);

  // ── Transport ──────────────────────────────────────────────
  const stopAllSources = useCallback(() => {
    nodesRef.current.forEach(n => {
      if (n.source) {
        try { n.source.stop(); } catch (_) {}
        try { n.source.disconnect(); } catch (_) {}
        n.source = null;
      }
    });
  }, []);

  const play = useCallback(async () => {
    if (!engineReady) return;
    const ctx = audioCtxRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();

    stopAllSources();
    nodesRef.current.forEach(n => n.plugin.reset());
    startTimeRef.current = ctx.currentTime;
    const offset = pauseOffsetRef.current;

    const currentStems = stemsRef.current;
    const hasSolo = currentStems.some(s => s.solo);

    currentStems.forEach(stemState => {
      const nodes = nodesRef.current.get(stemState.id);
      if (!nodes || !stemState.buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = stemState.buffer;
      source.loop = false;
      source.connect(nodes.plugin.inputNode);
      nodes.source = source;

      const audible = !stemState.muted && (!hasSolo || stemState.solo);
      nodes.gainNode.gain.setValueAtTime(audible ? 1 : 0, ctx.currentTime);
      source.start(ctx.currentTime, offset);
    });

    setIsPlaying(true);
  }, [engineReady, stopAllSources]);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    pauseOffsetRef.current += ctx.currentTime - startTimeRef.current;
    stopAllSources();
    setIsPlaying(false);
  }, [stopAllSources]);

  const stop = useCallback(() => {
    stopAllSources();
    pauseOffsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, [stopAllSources]);

  // ── Global controls ────────────────────────────────────────
  const setGlobalPitch = useCallback((semitones: number) => {
    setGlobalPitchState(semitones);
    nodesRef.current.forEach(n => n.plugin.setPitchSemitones(semitones));
    if (stemMode === 'global') {
      setStems(prev => prev.map(s => ({ ...s, pitchSemitones: semitones })));
    }
  }, [stemMode]);

  const setGlobalTempo = useCallback((ratio: number) => {
    setGlobalTempoState(ratio);
    nodesRef.current.forEach(n => n.plugin.setTempoRatio(ratio));
    if (stemMode === 'global') {
      setStems(prev => prev.map(s => ({ ...s, tempoRatio: ratio })));
    }
  }, [stemMode]);

  const setGlobalBypass = useCallback((enabled: boolean) => {
    setGlobalBypassState(enabled);
    nodesRef.current.forEach(n => n.plugin.bypass(enabled));
    setStems(prev => prev.map(s => ({ ...s, bypass: enabled })));
  }, []);

  const setLinked = useCallback((l: boolean) => {
    setLinkedState(l);
  }, []);

  const reset = useCallback(() => {
    setGlobalPitch(0);
    setGlobalTempo(1.0);
    setLinkedState(false);
  }, [setGlobalPitch, setGlobalTempo]);

  // ── Stem mode ──────────────────────────────────────────────
  const setStemMode = useCallback((mode: StemMode) => {
    setStemModeState(mode);
    if (mode === 'global') {
      nodesRef.current.forEach(n => {
        n.plugin.setPitchSemitones(globalPitch);
        n.plugin.setTempoRatio(globalTempo);
      });
      setStems(prev => prev.map(s => ({ ...s, pitchSemitones: globalPitch, tempoRatio: globalTempo })));
    }
  }, [globalPitch, globalTempo]);

  // ── Per-stem controls ──────────────────────────────────────
  const setStemPitch = useCallback((id: string, semitones: number) => {
    nodesRef.current.get(id)?.plugin.setPitchSemitones(semitones);
    setStems(prev => prev.map(st => st.id === id ? { ...st, pitchSemitones: semitones } : st));
  }, []);

  const setStemTempo = useCallback((id: string, ratio: number) => {
    nodesRef.current.get(id)?.plugin.setTempoRatio(ratio);
    setStems(prev => prev.map(st => st.id === id ? { ...st, tempoRatio: ratio } : st));
  }, []);

  const updateGains = useCallback((next: StemState[]) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const hasSolo = next.some(s => s.solo);
    next.forEach(s => {
      const nodes = nodesRef.current.get(s.id);
      if (!nodes) return;
      const audible = !s.muted && (!hasSolo || s.solo);
      nodes.gainNode.gain.linearRampToValueAtTime(audible ? 1 : 0, ctx.currentTime + 0.02);
    });
  }, []);

  const toggleMute = useCallback((id: string) => {
    setStems(prev => {
      const next = prev.map(s => s.id === id ? { ...s, muted: !s.muted } : s);
      updateGains(next);
      return next;
    });
  }, [updateGains]);

  const toggleSolo = useCallback((id: string) => {
    setStems(prev => {
      const next = prev.map(s => s.id === id ? { ...s, solo: !s.solo } : s);
      updateGains(next);
      return next;
    });
  }, [updateGains]);

  const toggleBypass = useCallback((id: string) => {
    setStems(prev => {
      const next = prev.map(s => s.id === id ? { ...s, bypass: !s.bypass } : s);
      const st = next.find(s => s.id === id);
      if (st) nodesRef.current.get(id)?.plugin.bypass(st.bypass);
      return next;
    });
  }, []);

  const getAnalyserNode = useCallback(() => analyserRef.current, []);

  return {
    // State
    engineReady,
    engineStatus,
    isPlaying,
    currentTime,
    duration,
    stemMode,
    globalPitch,
    globalTempo,
    globalBypass,
    linked,
    stems,
    // Actions
    play,
    pause,
    stop,
    setGlobalPitch,
    setGlobalTempo,
    setGlobalBypass,
    setLinked,
    reset,
    setStemMode,
    setStemPitch,
    setStemTempo,
    toggleMute,
    toggleSolo,
    toggleBypass,
    getAnalyserNode,
  };
}
