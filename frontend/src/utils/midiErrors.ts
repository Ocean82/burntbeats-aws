/**
 * User-facing MIDI error messages by operation context.
 */

export type MidiErrorContext =
  | "convert"
  | "download"
  | "export_zip"
  | "export_merge"
  | "export_history"
  | "queue_full"
  | "empty_export";

export function midiErrorMessage(
  context: MidiErrorContext,
  detail?: string | null,
): string {
  const trimmed = detail?.trim();
  if (trimmed) {
    if (context === "queue_full" || /queue.*full/i.test(trimmed)) {
      return "MIDI queue is busy — wait a moment and retry.";
    }
    if (context === "empty_export" || /no note/i.test(trimmed)) {
      return "This conversion has no notes to export.";
    }
  }

  switch (context) {
    case "download":
      return trimmed
        ? `Download failed: ${trimmed}`
        : "Download failed — try again or export from the editor.";
    case "export_zip":
      return trimmed
        ? `Stem archive export failed: ${trimmed}`
        : "Stem archive export failed.";
    case "export_merge":
      return trimmed
        ? `Multitrack merge failed: ${trimmed}`
        : "Multitrack merge failed.";
    case "export_history":
      return trimmed
        ? `Batch history export failed: ${trimmed}`
        : "Batch history export failed.";
    case "queue_full":
      return "MIDI queue is busy — wait a moment and retry.";
    case "empty_export":
      return "This conversion has no notes to export.";
    case "convert":
    default:
      return trimmed || "MIDI conversion failed. Please try again.";
  }
}

export function classifyMidiHttpError(
  status: number,
  bodyError?: string | null,
): string {
  if (status === 503) {
    return midiErrorMessage("queue_full", bodyError);
  }
  return bodyError?.trim() || `Request failed (${status})`;
}

interface MidiDownloadNameInput {
  stemName?: string | null;
  uploadName?: string | null;
  jobId?: string | null;
  suffix?: string;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function buildMidiDownloadName({
  stemName,
  uploadName,
  jobId,
  suffix = "mid",
}: MidiDownloadNameInput): string {
  const base =
    (stemName && sanitizeFilenamePart(stemName)) ||
    (uploadName && sanitizeFilenamePart(uploadName)) ||
    "transcription";
  const shortId = jobId ? jobId.slice(0, 8) : "";
  const stem = shortId ? `${base}-${shortId}` : base;
  return suffix === "mid" ? `${stem}.mid` : `${stem}.${suffix}`;
}
