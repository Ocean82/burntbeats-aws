import { formatDuration } from "./formatDuration";

export interface UploadMetaInput {
  name?: string;
  sizeBytes?: number | null;
  durationSec?: number | null;
  estimatedTokens?: number | null;
  isSample?: boolean;
}

/** Human-readable file size (e.g. 4.2 MB). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build inline upload metadata: "song.mp3 · 4.2 MB · 4:32 · ~5 tokens"
 * Omits segments when data is not yet available.
 */
export function formatUploadMeta(input: UploadMetaInput): string {
  const parts: string[] = [];
  if (input.sizeBytes != null && input.sizeBytes > 0) {
    parts.push(formatFileSize(input.sizeBytes));
  }
  if (input.durationSec != null && input.durationSec > 0) {
    parts.push(formatDuration(input.durationSec));
  }
  if (input.isSample) {
    parts.push("FREE");
  } else if (input.estimatedTokens != null) {
    const n = input.estimatedTokens;
    parts.push(`~${n} token${n === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
