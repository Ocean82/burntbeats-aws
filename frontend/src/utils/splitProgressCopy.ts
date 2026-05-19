/** Baseline minutes per queued job ahead of this one (rough UX estimate). */
export const QUEUE_JOB_MINUTES_BASELINE = 2;

export interface SplitProgressCopyInput {
  isUploading: boolean;
  uploadProgress: number;
  queuePosition: number | null;
  splitProgress: number;
  elapsedSeconds: number | null;
  uploadDurationSec: number | null;
  stemCount?: 2 | 4;
}

export interface SplitProgressMessage {
  primary: string;
  secondary?: string;
}

function formatEtaMinutes(minutes: number): string {
  if (minutes < 1) return "<1 min";
  const rounded = Math.ceil(minutes);
  return `~${rounded} min`;
}

function estimateQueueMinutes(
  queuePosition: number,
  uploadDurationSec: number | null,
): number {
  const durationMin =
    uploadDurationSec != null && uploadDurationSec > 0
      ? Math.max(1, Math.ceil(uploadDurationSec / 60))
      : QUEUE_JOB_MINUTES_BASELINE;
  return queuePosition * Math.max(QUEUE_JOB_MINUTES_BASELINE, durationMin * 0.5);
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

function estimateRemainingMinutes(
  progress: number,
  elapsedSeconds: number,
): string | undefined {
  if (progress <= 5 || progress >= 98) return undefined;
  const remainingSec = (elapsedSeconds / progress) * (100 - progress);
  const minutes = remainingSec / 60;
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  return formatEtaMinutes(minutes);
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
    const etaMin = estimateQueueMinutes(
      input.queuePosition,
      input.uploadDurationSec,
    );
    return {
      primary: `Queue position ${input.queuePosition} — waiting to start…`,
      secondary: formatEtaMinutes(etaMin),
    };
  }

  const primary = getRunningStageLabel(input.splitProgress, stemCount);
  const secondary =
    input.elapsedSeconds != null && input.elapsedSeconds > 0
      ? estimateRemainingMinutes(input.splitProgress, input.elapsedSeconds)
      : undefined;

  return { primary, secondary };
}
