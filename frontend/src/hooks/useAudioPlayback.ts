/**
 * Re-export shim — preserves `import { useAudioPlayback } from "./hooks/useAudioPlayback"`.
 * Actual implementation lives in `./audio/useAudioPlayback.ts`.
 */
export { useAudioPlayback } from "./audio/useAudioPlayback";
export type {
  UseAudioPlaybackReturn,
  UseAudioPlaybackOptions,
  MixStemRuntime,
  SeekPhase,
} from "./audio/useAudioPlayback";
