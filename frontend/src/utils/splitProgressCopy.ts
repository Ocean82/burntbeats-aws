export interface SplitProgressCopyInput {
  isUploading: boolean;
  uploadProgress: number;
  queuePosition: number | null;
  splitProgress: number;
  elapsedSeconds: number | null;
  uploadDurationSec: number | null;
  stemCount?: 2 | 4;
  progressStageLabel?: string | null;
}

export interface SplitProgressMessage {
  primary: string;
  secondary?: string;
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

  const primary =
    input.progressStageLabel ??
    getRunningStageLabel(input.splitProgress, stemCount);

  return { primary };
}
