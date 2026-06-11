/**
 * Master Bus processing types — EQ and compressor settings
 * for the client-side real-time master chain.
 */

export interface MasterEqState {
  /** Low shelf gain in dB (-12 to +12). Frequency: 150Hz. */
  lowGain: number;
  /** Mid peaking gain in dB (-12 to +12). Frequency: 1kHz, Q: 1.0. */
  midGain: number;
  /** High shelf gain in dB (-12 to +12). Frequency: 4kHz. */
  highGain: number;
  /** Whether the EQ is active. When false, nodes are bypassed. */
  enabled: boolean;
}

export interface MasterCompressorState {
  /** Threshold in dB (-60 to 0). */
  threshold: number;
  /** Ratio (1 to 20). */
  ratio: number;
  /** Attack in seconds (0.001 to 1). */
  attack: number;
  /** Release in seconds (0.01 to 1). */
  release: number;
  /** Whether the compressor is active. When false, node is bypassed. */
  enabled: boolean;
}

export const defaultMasterEq: MasterEqState = {
  lowGain: 0,
  midGain: 0,
  highGain: 0,
  enabled: false,
};

export const defaultMasterCompressor: MasterCompressorState = {
  threshold: -24,
  ratio: 4,
  attack: 0.01,
  release: 0.15,
  enabled: false,
};
