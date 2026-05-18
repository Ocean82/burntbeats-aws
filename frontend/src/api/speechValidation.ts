import type { SpeechJobStatus, SpeechJobStatusValue } from "./speechTypes";
import { isRecord } from "./validation";

function isSpeechStatusValue(value: unknown): value is SpeechJobStatusValue {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  );
}

export function isSpeechJobStatusValue(value: unknown): value is SpeechJobStatus {
  if (!isRecord(value)) return false;
  if (!isSpeechStatusValue(value.status)) return false;
  if (typeof value.progress !== "number" || !Number.isFinite(value.progress)) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.output_url !== undefined && typeof value.output_url !== "string") return false;
  return true;
}
