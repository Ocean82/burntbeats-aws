/**
 * useAudioPlayback — manages mix playback, stem preview, and playhead tracking.
 * Extracted from App.tsx.
 */
import { useCallback, useRef, useState } from "react";
import type { StemResult } from "../types";
import { trimToSeconds, createStemPreviewBuffer } from "../utils/audio";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../components/MultiStemEditor";
import type { StemId } from "../types";

interface UseAudioPlaybackReturn {
  isPlayingMix: boolean;
  isPlayingMixRef: React.MutableRefObject<boolean>;
  playingStem: string | null;
  playheadPosition: number;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  handlePlayMix: (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>
  ) => Promise<void>;
  handleStopMix: () => void;
  handlePreviewStem: (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>
  ) => Promise<void>;
  stopPreview: () => void;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [playheadPosition, setPlayheadPosition] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mixSourceRefs = useRef<AudioBufferSourceNode[]>([]);
  const isPlayingMixRef = useRef(false);
  const playheadIntervalRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const mixDurationRef = useRef<number>(0);

  const getOrCreateContext = useCallback(async (): Promise<AudioContext | null> => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
    await audioContextRef.current.resume();
    return audioContextRef.current;
  }, []);

  const stopPreview = useCallback(() => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }
    setPlayingStem(null);
  }, []);

  const handleStopMix = useCallback(() => {
    mixSourceRefs.current.forEach((s) => {
      try { s.stop(); } catch { /* ignored */ }
      s.disconnect();
    });
    mixSourceRefs.current = [];
    setIsPlayingMix(false);
    isPlayingMixRef.current = false;
    if (playheadIntervalRef.current) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
    setPlayheadPosition(0);
  }, []);

  const handlePlayMix = useCallback(async (
    splitResultStems: StemResult[],
    stemStates: Record<string, StemEditorState>,
    stemBuffers: Record<string, AudioBuffer>
  ) => {
    if (isPlayingMix) { handleStopMix(); return; }
    stopPreview();

    const hasSolo = splitResultStems.some((s) => stemStates[s.id]?.soloed);
    const stemsToPlay = hasSolo
      ? splitResultStems.filter((s) => stemStates[s.id]?.soloed)
      : splitResultStems.filter((s) => !stemStates[s.id]?.muted);
    if (stemsToPlay.length === 0) return;

    const context = await getOrCreateContext();
    if (!context) return;

    const sources: AudioBufferSourceNode[] = [];
    for (const stem of stemsToPlay) {
      const buffer = stemBuffers[stem.id];
      if (!buffer) continue;
      const st = stemStates[stem.id] ?? defaultStemState();
      const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
      const playDuration = trimEnd - trimStart;

      const source = context.createBufferSource();
      const gainNode = context.createGain();
      const panNode = context.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = getStemEffectiveRate(st);
      gainNode.gain.value = Math.pow(10, st.mixer.gain / 20);
      panNode.pan.value = st.mixer.pan / 100;
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(context.destination);
      source.start(0, trimStart, playDuration);
      source.onended = () => {
        mixSourceRefs.current = mixSourceRefs.current.filter((x) => x !== source);
        if (mixSourceRefs.current.length === 0) {
          setIsPlayingMix(false);
          isPlayingMixRef.current = false;
        }
      };
      sources.push(source);
    }

    mixSourceRefs.current = sources;
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
        setPlayheadPosition(progress);
        if (progress < 100 && isPlayingMixRef.current) {
          playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [isPlayingMix, handleStopMix, stopPreview, getOrCreateContext]);

  const handlePreviewStem = useCallback(async (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>
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

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      gain.gain.value = 0.85;
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
          setPlayingStem(null);
        }
      };
      currentSourceRef.current = source;
      source.start();
      setPlayingStem(stemId);
    } catch (err) {
      console.error("Preview failed:", err);
      setPlayingStem(null);
    }
  }, [playingStem, stopPreview, getOrCreateContext]);

  return {
    isPlayingMix,
    isPlayingMixRef,
    playingStem,
    playheadPosition,
    audioContextRef,
    handlePlayMix,
    handleStopMix,
    handlePreviewStem,
    stopPreview,
  };
}
