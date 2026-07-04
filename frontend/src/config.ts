/**
 * When set (`VITE_LOCAL_DEV_FULL_APP=1`), the UI skips Clerk sign-in and treats
 * subscription as Premium — for local stem/mixer testing without login or Stripe.
 * Requires Vite `mode === "development"` so a stray env var in a production build cannot disable the paywall.
 */
export function isLocalDevFullApp(): boolean {
  if (import.meta.env.MODE !== "development") return false;
  if (import.meta.env.PROD) return false;
  const v = String(import.meta.env.VITE_LOCAL_DEV_FULL_APP ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true";
}

export interface ClerkProviderConfig {
  clerkPubKey: string | undefined;
  isLocalDevFullApp: boolean;
}

export function shouldMountClerkProvider({
  clerkPubKey,
  isLocalDevFullApp,
}: ClerkProviderConfig): boolean {
  if (isLocalDevFullApp) return false;
  return Boolean(clerkPubKey);
}

export function isInternalHealthPanelEnabled(): boolean {
  const enabled = ["1", "true", "yes"].includes(
    String(import.meta.env.VITE_INTERNAL_HEALTH_PANEL_ENABLED ?? "")
      .trim()
      .toLowerCase(),
  );
  if (import.meta.env.PROD) return enabled;
  return true;
}

/** Must stay in sync with backend MAX_UPLOAD_BYTES (default 500MB). Override with VITE_MAX_UPLOAD_BYTES. */
export const MAX_UPLOAD_BYTES =
  Number(import.meta.env.VITE_MAX_UPLOAD_BYTES) > 0
    ? Number(import.meta.env.VITE_MAX_UPLOAD_BYTES)
    : 500 * 1024 * 1024;

// Centralized API base URL (no trailing slash).
export const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : typeof window !== "undefined" && window.location.hostname !== "localhost"
      ? window.location.origin
      : "http://localhost:3001";

/** Optional server-side export feature flag. Disabled by default to avoid 404 noise when backend export is off. */
export const SERVER_EXPORT_ENABLED = ["1", "true", "yes"].includes(
  String(import.meta.env.VITE_SERVER_EXPORT_ENABLED ?? "")
    .trim()
    .toLowerCase(),
);

// Global configuration constants: first step is always 2-stem (vocals + instrumental).
export const DEFAULT_STEM_COUNT = 2 as const;

export const MASTER_CHAIN = {
  compression: 2.4,
  limiter: -0.8,
  loudness: -9,
} as const;

export const PIPELINE_ANIMATION_DELAYS_MS = {
  toStep1: 400,
  toStep2: 1200,
} as const;

export const PIPELINE_PROGRESS_THRESHOLDS = { step2: 50, step3: 100 } as const;

/** Allowed audio file extensions (must stay in sync with backend ALLOWED_AUDIO_EXTS). */
export const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
]);

/** Human-readable label for supported formats (shown in UI). */
export const ALLOWED_AUDIO_FORMATS_LABEL = "MP3, WAV, FLAC, OGG, M4A, AAC";

/**
 * Value for `<input type="file" accept="...">` — lists specific MIME types and extensions
 * so mobile file pickers filter to supported formats only.
 */
export const AUDIO_INPUT_ACCEPT =
  ".mp3,.wav,.flac,.ogg,.m4a,.aac,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/flac,audio/x-flac,audio/ogg,audio/mp4,audio/x-m4a,audio/aac,audio/x-aac";

/** Check if a filename has a supported audio extension. */
export function isAllowedAudioFile(filename: string): boolean {
  const ext =
    filename.lastIndexOf(".") !== -1
      ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
      : "";
  return ALLOWED_AUDIO_EXTENSIONS.has(ext);
}

/** Must match midi_service MIDI_MAX_UPLOAD_MB (default 100). */
export const MIDI_MAX_UPLOAD_BYTES =
  Number(import.meta.env.VITE_MIDI_MAX_UPLOAD_BYTES) > 0
    ? Number(import.meta.env.VITE_MIDI_MAX_UPLOAD_BYTES)
    : 100 * 1024 * 1024;

/** MIDI conversion formats (must match midi_service SUPPORTED_AUDIO_FORMATS; no AAC). */
export const MIDI_ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".webm",
]);

export const MIDI_ALLOWED_AUDIO_FORMATS_LABEL =
  "MP3, WAV, FLAC, OGG, M4A, WebM";

export const MIDI_AUDIO_INPUT_ACCEPT =
  ".mp3,.wav,.flac,.ogg,.m4a,.webm,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/flac,audio/x-flac,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,video/webm";

export function isAllowedMidiAudioFile(filename: string): boolean {
  const ext =
    filename.lastIndexOf(".") !== -1
      ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
      : "";
  return MIDI_ALLOWED_AUDIO_EXTENSIONS.has(ext);
}
