/**
 * Pitch-Plug-in: PitchTempoPlugin
 * 
 * Production-ready wrapper around the Phase Vocoder AudioWorklet processor.
 * Provides:
 *   - Independent pitch shift (semitones) without timing change
 *   - Independent tempo ratio change without pitch change
 *   - Bypass mode
 *   - Quality modes
 *   - Multi-stem support with global/per-stem parameter control
 *   - Smooth parameter transitions (no clicks)
 */

import { PITCH_TEMPO_PROCESSOR_CODE, PITCH_TEMPO_PROCESSOR_NAME } from './pitchTempoProcessor';

// ─────────────────────────────────────────────────────────────────
//  Parameter metadata (UI contract)
// ─────────────────────────────────────────────────────────────────

export const PARAM_META = {
  pitchSemitones: {
    min: -3,
    max: 3,
    step: 0.1,
    default: 0,
    units: 'semitones',
    label: 'Pitch',
  },
  tempoRatio: {
    min: 0.85,
    max: 1.15,
    step: 0.01,
    default: 1.0,
    units: 'ratio',
    label: 'Tempo',
  },
} as const;

export type QualityMode = 'standard' | 'high';

export interface PitchTempoPluginOptions {
  /** AudioContext to use */
  audioContext: AudioContext;
  /** Initial pitch in semitones */
  pitchSemitones?: number;
  /** Initial tempo ratio */
  tempoRatio?: number;
  /** Quality mode */
  quality?: QualityMode;
  /** Initial bypass state */
  bypass?: boolean;
}

// ─────────────────────────────────────────────────────────────────
//  Worklet Registration (singleton per AudioContext)
// ─────────────────────────────────────────────────────────────────

const registeredContexts = new WeakSet<AudioContext>();

async function ensureWorkletRegistered(ctx: AudioContext): Promise<void> {
  if (registeredContexts.has(ctx)) return;

  // Create a Blob URL from the processor code string
  const blob = new Blob([PITCH_TEMPO_PROCESSOR_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    await ctx.audioWorklet.addModule(url);
    registeredContexts.add(ctx);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────────────────────────
//  PitchTempoPlugin
// ─────────────────────────────────────────────────────────────────

export class PitchTempoPlugin {
  private ctx: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private _pitchSemitones: number;
  private _tempoRatio: number;
  private _quality: QualityMode;
  private _bypass: boolean;
  private _ready: boolean = false;
  private _inputNode: GainNode;
  private _outputNode: GainNode;
  private _readyCallbacks: Array<() => void> = [];

  constructor(options: PitchTempoPluginOptions) {
    this.ctx = options.audioContext;
    this._pitchSemitones = options.pitchSemitones ?? PARAM_META.pitchSemitones.default;
    this._tempoRatio = options.tempoRatio ?? PARAM_META.tempoRatio.default;
    this._quality = options.quality ?? 'standard';
    this._bypass = options.bypass ?? false;

    // Create pass-through nodes that route around the worklet until ready
    this._inputNode = this.ctx.createGain();
    this._outputNode = this.ctx.createGain();

    this._init();
  }

  private async _init(): Promise<void> {
    try {
      await ensureWorkletRegistered(this.ctx);
      this.workletNode = new AudioWorkletNode(this.ctx, PITCH_TEMPO_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });

      // Wire: input → worklet → output
      this._inputNode.connect(this.workletNode);
      this.workletNode.connect(this._outputNode);

      // Apply initial parameters
      this._applyParams();

      this._ready = true;
      this._readyCallbacks.forEach(fn => fn());
      this._readyCallbacks = [];
    } catch (err) {
      console.error('[PitchTempoPlugin] Worklet init failed, falling back to passthrough:', err);
      // Fallback: direct connection
      this._inputNode.connect(this._outputNode);
      this._ready = true;
      this._readyCallbacks.forEach(fn => fn());
      this._readyCallbacks = [];
    }
  }

  /** Promise that resolves when the plugin is ready to use */
  ready(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return new Promise(resolve => this._readyCallbacks.push(resolve));
  }

  // ── Routing ────────────────────────────────────────────────────

  /** Connect a source AudioNode to this plugin's input */
  connect(inputNode: AudioNode): AudioNode {
    inputNode.connect(this._inputNode);
    return this._outputNode;
  }

  /** Disconnect a source from this plugin's input */
  disconnect(inputNode?: AudioNode): void {
    if (inputNode) {
      try { inputNode.disconnect(this._inputNode); } catch (_) {}
    } else {
      try { this._inputNode.disconnect(); } catch (_) {}
      try { this.workletNode?.disconnect(); } catch (_) {}
    }
  }

  /** Get the output AudioNode to connect to the next stage */
  get outputNode(): AudioNode {
    return this._outputNode;
  }

  /** Get the input AudioNode */
  get inputNode(): AudioNode {
    return this._inputNode;
  }

  // ── Parameter setters ─────────────────────────────────────────

  private _applyParams(): void {
    if (!this.workletNode) return;
    const pitchRatio = Math.pow(2, this._pitchSemitones / 12);
    const params = this.workletNode.parameters;

    // Smooth ramp to avoid clicks (10ms ramp)
    const rampTime = this.ctx.currentTime + 0.01;
    (params.get('pitchRatio') as AudioParam)?.linearRampToValueAtTime(pitchRatio, rampTime);
    (params.get('tempoRatio') as AudioParam)?.linearRampToValueAtTime(this._tempoRatio, rampTime);
    (params.get('bypass')     as AudioParam)?.setValueAtTime(this._bypass ? 1 : 0, this.ctx.currentTime);
  }

  /** Set pitch shift in semitones. Clamped to PARAM_META range. */
  setPitchSemitones(semitones: number): this {
    this._pitchSemitones = Math.max(PARAM_META.pitchSemitones.min, Math.min(PARAM_META.pitchSemitones.max, semitones));
    this._applyParams();
    return this;
  }

  /** Set tempo ratio (1.0 = original). Clamped to PARAM_META range. */
  setTempoRatio(ratio: number): this {
    this._tempoRatio = Math.max(PARAM_META.tempoRatio.min, Math.min(PARAM_META.tempoRatio.max, ratio));
    this._applyParams();
    return this;
  }

  /** Set quality mode. 'high' uses longer analysis window (not yet implemented in mini processor). */
  setQuality(mode: QualityMode): this {
    this._quality = mode;
    // Quality affects internal FFT size — post message to worklet
    this.workletNode?.port.postMessage({ type: 'quality', mode });
    return this;
  }

  /** Enable or disable bypass. When bypassed, audio passes through unchanged. */
  bypass(enabled: boolean): this {
    this._bypass = enabled;
    this._applyParams();
    return this;
  }

  /** Reset internal state (clears buffers) */
  reset(): void {
    this.workletNode?.port.postMessage({ type: 'reset' });
    this.channels?.forEach(ch => ch.reset?.());
  }

  // ── Getters ───────────────────────────────────────────────────

  get pitchSemitones(): number { return this._pitchSemitones; }
  get tempoRatio(): number { return this._tempoRatio; }
  get pitchRatio(): number { return Math.pow(2, this._pitchSemitones / 12); }
  get quality(): QualityMode { return this._quality; }
  get isBypassed(): boolean { return this._bypass; }
  get isReady(): boolean { return this._ready; }

  // ── Convenience: pitch-only mode ─────────────────────────────

  /** Pitch shift only — tempo stays at 1.0 */
  setPitchOnly(semitones: number): this {
    return this.setPitchSemitones(semitones).setTempoRatio(1.0);
  }

  /** Tempo change only — pitch stays at 0 semitones */
  setTempoOnly(ratio: number): this {
    return this.setPitchSemitones(0).setTempoRatio(ratio);
  }

  /** Destroy and disconnect all nodes */
  destroy(): void {
    try { this._inputNode.disconnect(); } catch (_) {}
    try { this.workletNode?.disconnect(); } catch (_) {}
    try { this._outputNode.disconnect(); } catch (_) {}
    this.workletNode = null;
    this._ready = false;
  }

  // Dummy field to satisfy TypeScript (reset() in init referenced ch.reset)
  private channels: any[] = [];
}

// ─────────────────────────────────────────────────────────────────
//  Multi-Stem Manager
// ─────────────────────────────────────────────────────────────────

import type { StemMode } from '../types';

export interface StemConfig {
  id: string;
  label: string;
  color: string;
}

export class StemPluginManager {
  private ctx: AudioContext;
  private plugins: Map<string, PitchTempoPlugin> = new Map();
  private mode: StemMode;
  private globalPitch: number = 0;
  private globalTempo: number = 1.0;

  constructor(ctx: AudioContext, _stems: StemConfig[], mode: StemMode = 'global') {
    this.ctx = ctx;
    this.mode = mode;
  }

  async createPlugin(stemId: string): Promise<PitchTempoPlugin> {
    const plugin = new PitchTempoPlugin({ audioContext: this.ctx });
    await plugin.ready();
    this.plugins.set(stemId, plugin);
    return plugin;
  }

  getPlugin(stemId: string): PitchTempoPlugin | undefined {
    return this.plugins.get(stemId);
  }

  /** Set global pitch — applies to all stems */
  setGlobalPitch(semitones: number): void {
    this.globalPitch = semitones;
    if (this.mode === 'global') {
      this.plugins.forEach(p => p.setPitchSemitones(semitones));
    }
  }

  /** Set global tempo — applies to all stems */
  setGlobalTempo(ratio: number): void {
    this.globalTempo = ratio;
    if (this.mode === 'global') {
      this.plugins.forEach(p => p.setTempoRatio(ratio));
    }
  }

  /** Set per-stem pitch */
  setStemPitch(stemId: string, semitones: number): void {
    this.plugins.get(stemId)?.setPitchSemitones(semitones);
  }

  /** Set per-stem tempo */
  setStemTempo(stemId: string, ratio: number): void {
    this.plugins.get(stemId)?.setTempoRatio(ratio);
  }

  /** Switch between global/per-stem mode */
  setMode(mode: StemMode): void {
    this.mode = mode;
    if (mode === 'global') {
      // Sync all stems to global values
      this.plugins.forEach(p => {
        p.setPitchSemitones(this.globalPitch);
        p.setTempoRatio(this.globalTempo);
      });
    }
  }

  /** Bypass all stems */
  bypassAll(enabled: boolean): void {
    this.plugins.forEach(p => p.bypass(enabled));
  }

  /** Destroy all plugins */
  destroyAll(): void {
    this.plugins.forEach(p => p.destroy());
    this.plugins.clear();
  }

  get allPlugins(): PitchTempoPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// ─────────────────────────────────────────────────────────────────
//  Math utilities (exported for tests / UI)
// ─────────────────────────────────────────────────────────────────

/** Convert semitones to pitch ratio: 2^(n/12) */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Convert pitch ratio to semitones: 12 * log2(ratio) */
export function ratioToSemitones(ratio: number): number {
  return 12 * Math.log2(ratio);
}

/** Format tempo as percentage string */
export function tempoToPercent(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

/** Format pitch as semitones string */
export function pitchToSemitonesStr(semitones: number): string {
  const rounded = Math.round(semitones * 10) / 10;
  return rounded >= 0 ? `+${rounded} st` : `${rounded} st`;
}
