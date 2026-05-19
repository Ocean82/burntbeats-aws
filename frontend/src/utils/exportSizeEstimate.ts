import type { ExportFormat, ExportTarget } from "../components/ExportOptionsModal";

export interface ExportSizeEstimateInput {
  format: ExportFormat;
  target: ExportTarget;
  stemCount: number;
  durationSec: number;
  sampleRate?: number;
  channels?: number;
}

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHANNELS = 2;
/** MP3 display estimate ~128 kbps */
const MP3_BITS_PER_SECOND = 128_000;

function fileCountForTarget(target: ExportTarget, stemCount: number): number {
  switch (target) {
    case "master":
      return 1;
    case "stems":
      return Math.max(1, stemCount);
    case "all":
      return Math.max(1, stemCount) + 1;
    default:
      return 1;
  }
}

export function estimateExportBytes(input: ExportSizeEstimateInput): number {
  const duration = Math.max(0, input.durationSec);
  const stemCount = Math.max(1, input.stemCount);
  const files = fileCountForTarget(input.target, stemCount);
  const sampleRate = input.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = input.channels ?? DEFAULT_CHANNELS;

  if (input.format === "mp3") {
    return Math.ceil((duration * MP3_BITS_PER_SECOND * files) / 8);
  }

  // WAV PCM 16-bit
  const bytesPerSecond = sampleRate * channels * 2;
  return Math.ceil(duration * bytesPerSecond * files);
}

export function formatExportBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "~0 MB";
  if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `~${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `~${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type ExportSizeWarningLevel = "none" | "medium" | "large";

export function getExportSizeWarningLevel(bytes: number): ExportSizeWarningLevel {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return "large";
  if (mb >= 50) return "medium";
  return "none";
}
