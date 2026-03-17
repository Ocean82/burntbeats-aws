import type { MixerState, TrimState } from "../types";
import { defaultTrim, defaultMixer } from "../types";
import { audioBufferToWav, normalizeAudioBuffer, trimToSeconds } from "../utils/audio";

export interface AudioEngineState {
  context: AudioContext | null;
  isPlaying: boolean;
  /** @deprecated Use isPlaying and context.state instead */
  isPaused: boolean;
  currentTime: number;
  duration: number;
  playheadPosition: number;
}

export interface StemPlaybackNode {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
}

export type PlaybackEventCallback = (event: { type: 'start' | 'stop' | 'timeupdate'; time?: number }) => void;

export class AudioEngine {
  private context: AudioContext | null = null;
  private stemBuffers: Map<string, AudioBuffer> = new Map();
  private playbackNodes: Map<string, StemPlaybackNode> = new Map();
  private playStartTime: number = 0;
  private mixDuration: number = 0;
  private animationFrameId: number | null = null;
  private eventCallbacks: Set<PlaybackEventCallback> = new Set();

  get isPlaying(): boolean {
    // Consider both having active nodes and audio context state
    return this.playbackNodes.size > 0 && this.context?.state === 'running';
  }

  get currentContext(): AudioContext | null {
    return this.context;
  }

  async initialize(): Promise<AudioContext> {
    if (this.context) {
      await this.context.resume();
      return this.context;
    }
    
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    
    if (!AudioContextCtor) {
      throw new Error("Web Audio API not supported");
    }
    
    this.context = new AudioContextCtor();
    await this.context.resume();
    return this.context;
  }

  async loadStem(stemId: string, url: string): Promise<AudioBuffer> {
    if (this.stemBuffers.has(stemId)) {
      return this.stemBuffers.get(stemId)!;
    }

    if (!this.context) {
      await this.initialize();
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load stem: ${res.status}`);
    }
    
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await this.context!.decodeAudioData(arrayBuffer);
    this.stemBuffers.set(stemId, audioBuffer);
    return audioBuffer;
  }

  async loadStemsParallel(stems: Array<{ id: string; url: string }>): Promise<Map<string, AudioBuffer>> {
    if (!this.context) {
      await this.initialize();
    }

    const loadPromises = stems.map(async (stem) => {
      const buffer = await this.loadStem(stem.id, stem.url);
      return { id: stem.id, buffer };
    });

    const results = await Promise.all(loadPromises);
    const bufferMap = new Map<string, AudioBuffer>();
    results.forEach(({ id, buffer }) => bufferMap.set(id, buffer));
    return bufferMap;
  }

  getBuffer(stemId: string): AudioBuffer | undefined {
    return this.stemBuffers.get(stemId);
  }

  hasBuffer(stemId: string): boolean {
    return this.stemBuffers.has(stemId);
  }

  setBuffer(stemId: string, buffer: AudioBuffer): void {
    this.stemBuffers.set(stemId, buffer);
  }

  onPlaybackEvent(callback: PlaybackEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  private emitEvent(event: { type: 'start' | 'stop' | 'timeupdate'; time?: number }): void {
    this.eventCallbacks.forEach(cb => cb(event));
  }

  async previewStem(
    stemId: string,
    volume: number = 0.85
  ): Promise<void> {
    this.stopAll();

    if (!this.context) {
      await this.initialize();
    }

    const buffer = this.stemBuffers.get(stemId);
    if (!buffer) {
      throw new Error(`No buffer loaded for stem: ${stemId}`);
    }

    const source = this.context!.createBufferSource();
    const gain = this.context!.createGain();
    const panNode = this.context!.createStereoPanner();

    source.buffer = buffer;
    source.connect(gain);
    gain.connect(panNode);
    panNode.connect(this.context!.destination);
    gain.gain.value = volume;

    source.onended = () => {
      this.playbackNodes.delete(stemId);
      if (this.playbackNodes.size === 0) {
        this.emitEvent({ type: 'stop' });
      }
    };

    this.playbackNodes.set(stemId, { source, gainNode: gain, panNode });
    source.start();
    this.emitEvent({ type: 'start' });
  }

  async playMix(
    stems: Array<{ id: string; buffer: AudioBuffer; trim: TrimState; mixer: MixerState }>,
    mutedStems: Record<string, boolean>,
    soloStems: Record<string, boolean>,
    trimMap: Record<string, TrimState>,
    mixerState: Record<string, MixerState>
  ): Promise<void> {
    this.stopAll();

    const hasSolo = Object.values(soloStems).some(v => v);
    const stemsToPlay = hasSolo
      ? stems.filter(s => soloStems[s.id])
      : stems.filter(s => !mutedStems[s.id]);

    if (stemsToPlay.length === 0) return;

    if (!this.context) {
      await this.initialize();
    }

    const firstStem = stemsToPlay[0];
    const firstTrim = trimMap[firstStem.id] ?? defaultTrim;
    const { trimStart, trimEnd } = trimToSeconds(firstStem.buffer, firstTrim);
    this.mixDuration = trimEnd - trimStart;
    this.playStartTime = this.context!.currentTime;

    stemsToPlay.forEach(stem => {
      const buffer = stem.buffer;
      const trim = trimMap[stem.id] ?? defaultTrim;
      const mixer = mixerState[stem.id] ?? defaultMixer;
      const { trimStart, trimEnd } = trimToSeconds(buffer, trim);
      const playDuration = trimEnd - trimStart;
      
      const gainVal = Math.pow(10, mixer.gain / 20);
      const panVal = mixer.pan / 100;

      const source = this.context!.createBufferSource();
      const gainNode = this.context!.createGain();
      const panNode = this.context!.createStereoPanner();

      source.buffer = buffer;
      gainNode.gain.value = gainVal;
      panNode.pan.value = panVal;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(this.context!.destination);

      source.start(0, trimStart, playDuration);
      
      source.onended = () => {
        this.playbackNodes.delete(stem.id);
        if (this.playbackNodes.size === 0) {
          this.emitEvent({ type: 'stop' });
        }
      };

      this.playbackNodes.set(stem.id, { source, gainNode, panNode });
    });

    this.emitEvent({ type: 'start' });
    this.startPlayheadTracking();
  }

  private startPlayheadTracking(): void {
    const update = () => {
      if (!this.isPlaying || !this.context) return;
      
      const elapsed = this.context.currentTime - this.playStartTime;
      const progress = Math.min(100, (elapsed / this.mixDuration) * 100);
      
      this.emitEvent({ type: 'timeupdate', time: progress });

      if (progress < 100) {
        this.animationFrameId = requestAnimationFrame(update);
      }
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  stopAll(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.playbackNodes.forEach((nodes) => {
      try {
        nodes.source.stop();
      } catch {
        // Already stopped
      }
      nodes.source.disconnect();
    });
    this.playbackNodes.clear();
    this.emitEvent({ type: 'stop' });
  }

  updateStemGain(stemId: string, gain: number): void {
    const nodes = this.playbackNodes.get(stemId);
    if (nodes?.gainNode) {
      nodes.gainNode.gain.value = Math.pow(10, gain / 20);
    }
  }

  updateStemPan(stemId: string, pan: number): void {
    const nodes = this.playbackNodes.get(stemId);
    if (nodes?.panNode) {
      nodes.panNode.pan.value = pan / 100;
    }
  }

  async exportMix(
    stems: Array<{ id: string; buffer: AudioBuffer; trim: TrimState; mixer: MixerState }>,
    mutedStems: Record<string, boolean>,
    soloStems: Record<string, boolean>,
    trimMap: Record<string, TrimState>,
    mixerState: Record<string, MixerState>,
    options?: { normalize?: boolean }
  ): Promise<Blob> {
    const hasSolo = Object.values(soloStems).some(v => v);
    const stemsToMix = hasSolo
      ? stems.filter(s => soloStems[s.id])
      : stems.filter(s => !mutedStems[s.id]);

    let maxDuration = 0;
    const sources: {
      buffer: AudioBuffer;
      gain: number;
      pan: number;
      trimStart: number;
      trimEnd: number;
    }[] = [];

    stemsToMix.forEach(stem => {
      const trim = trimMap[stem.id] ?? defaultTrim;
      const mixer = mixerState[stem.id] ?? defaultMixer;
      const { trimStart, trimEnd } = trimToSeconds(stem.buffer, trim);
      const trimmedDuration = trimEnd - trimStart;
      maxDuration = Math.max(maxDuration, trimmedDuration);
      
      sources.push({
        buffer: stem.buffer,
        gain: Math.pow(10, mixer.gain / 20),
        pan: mixer.pan / 100,
        trimStart,
        trimEnd,
      });
    });

    if (maxDuration === 0) {
      throw new Error("No valid stems to export");
    }

    const exactFrameCount = Math.ceil(maxDuration * 44100);
    const offlineContext = new OfflineAudioContext(2, exactFrameCount, 44100);

    sources.forEach(({ buffer, gain, pan, trimStart, trimEnd }) => {
      const source = offlineContext.createBufferSource();
      const gainNode = offlineContext.createGain();
      const panNode = offlineContext.createStereoPanner();

      source.buffer = buffer;
      gainNode.gain.value = gain;
      panNode.pan.value = pan;

      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(offlineContext.destination);

      const playDuration = trimEnd - trimStart;
      source.start(0, trimStart, playDuration);
    });

    let rendered = await offlineContext.startRendering();
    if (options?.normalize) {
      rendered = normalizeAudioBuffer(rendered);
    }
    return audioBufferToWav(rendered);
  }

  dispose(): void {
    this.stopAll();
    this.stemBuffers.clear();
    this.context?.close();
    this.context = null;
  }
}

export const audioEngine = new AudioEngine();
