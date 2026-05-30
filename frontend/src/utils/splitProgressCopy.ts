import type { SplitIntent } from "@shared/types";

export interface SplitProgressCopyInput {
  isUploading: boolean;
  uploadProgress: number;
  queuePosition: number | null;
  splitProgress: number;
  elapsedSeconds: number | null;
  uploadDurationSec: number | null;
  stemCount?: 2 | 4;
  progressStageLabel?: string | null;
  splitIntent?: SplitIntent | null;
}

export interface SplitProgressMessage {
  primary: string;
  secondary?: string;
}

function formatTargets(targets: string[]): string {
  if (targets.length === 0) return "stems";
  if (targets.length === 1) return targets[0];
  if (targets.length === 2) return `${targets[0]} and ${targets[1]}`;
  return `${targets.slice(0, -1).join(", ")}, and ${targets[targets.length - 1]}`;
}

/** Client fallback when the backend has not yet sent progress_stage_label. */
export function intentRunningProgressLabel(
  intent: SplitIntent,
  progress: number,
): string {
  if (progress < 5) return "Preparing job…";
  if (progress >= 96) return "Finalising stems…";
  if (intent.task === "remove") {
    return progress < 88
      ? "Separating vocals…"
      : "Building instrumental (karaoke)…";
  }
  if (intent.task === "extract" && intent.targets?.length) {
    return `Extracting ${formatTargets(intent.targets)}…`;
  }
  if (intent.task === "full_separation") {
    return intent.mode === "4"
      ? "Separating vocals…"
      : "Separating vocals…";
  }
  return "Processing…";
}

function getRunningStageLabel(
  progress: number,
  stemCount: 2 | 4,
): string {
  if (progress < 5) return "Starting…";
  if (stemCount === 2) {
    if (progress < 85) return "Separating vocals…";
    if (progress < 95) return "Building instrumental…";
    return "Finalising stems…";
  }
  if (progress < 40) return "Separating vocals…";
  if (progress < 75) return "Splitting drums & bass…";
  if (progress < 95) return "Building remaining stems…";
  return "Finalising stems…";
}

export function getSplitProgressMessage(
  input: SplitProgressCopyInput,
): SplitProgressMessage {
  const stemCount = input.stemCount ?? 2;

  if (input.isUploading) {
    return {
      primary: "Uploading…",
      secondary: `${Math.round(input.uploadProgress)}%`,
    };
  }

  if (input.queuePosition != null) {
    return {
      primary: `Queue position ${input.queuePosition} — waiting to start…`,
    };
  }

  const intentFallback =
    input.splitIntent &&
    input.splitIntent.task !== "full_separation"
      ? intentRunningProgressLabel(input.splitIntent, input.splitProgress)
      : null;

  const primary =
    input.progressStageLabel ??
    intentFallback ??
    getRunningStageLabel(input.splitProgress, stemCount);

  return { primary };
}
