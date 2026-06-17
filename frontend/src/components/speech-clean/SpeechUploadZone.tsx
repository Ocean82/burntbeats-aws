import { Mic, Upload, Waves } from "lucide-react";
import { cn } from "../../utils/cn";
import { ALLOWED_AUDIO_FORMATS_LABEL } from "../../config";
import { useIsTouchDevice } from "../../hooks/useIsTouchDevice";
import { formatUploadMeta } from "../../utils/formatFileMeta";

export interface SpeechUploadZoneProps {
  uploadName: string;
  uploadedFile: File | null;
  durationSec?: number | null;
  estimatedTokens?: number | null;
  onBrowse: () => void;
  onClear: () => void;
  onDrop: (file: File | null) => void;
  isDragging: boolean;
  onSetIsDragging: (v: boolean) => void;
}

/** Speech-only upload — cyan accent, distinct from stem splitter (amber). */
export function SpeechUploadZone({
  uploadName,
  uploadedFile,
  durationSec = null,
  estimatedTokens = null,
  onBrowse,
  onClear,
  onDrop,
  isDragging,
  onSetIsDragging,
}: SpeechUploadZoneProps) {
  const isTouch = useIsTouchDevice();
  const metaLine = formatUploadMeta({
    sizeBytes: uploadedFile?.size,
    durationSec,
    estimatedTokens,
  });

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      onSetIsDragging(true);
    },
    onDragLeave: () => onSetIsDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onSetIsDragging(false);
      onDrop(e.dataTransfer.files?.[0] ?? null);
    },
  };

  if (uploadedFile) {
    return (
      <div
        data-testid="speech-upload-zone"
        role="region"
        aria-label="Speech upload"
        {...dragProps}
        className={cn(
          "mb-sm flex w-full items-center justify-between gap-sm rounded-xl border px-md py-sm transition-all",
          "border-info-400/25 bg-info-950/20 hover:border-info-400/40",
          isDragging && "scale-[1.01] border-info-300/60 bg-info-950/35",
        )}
      >
        <Mic className="h-4 w-4 shrink-0 text-info-300/80" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {uploadName}
          </span>
          {metaLine ? (
            <span
              className="mt-0.5 block truncate text-xs tabular-nums text-info-200/50"
              aria-label={`File details: ${metaLine}`}
            >
              {metaLine}
            </span>
          ) : (
            <span className="mt-0.5 block h-4 text-xs text-muted-foreground" aria-hidden>
              Reading file info…
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          <button
            type="button"
            onClick={onClear}
            className="min-h-[32px] rounded-lg border border-border px-sm py-1 text-xs text-muted-foreground hover:border-border hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onBrowse}
            className="min-h-[32px] rounded-lg border border-info-400/30 px-sm py-1 text-xs font-semibold text-info-100/90 hover:border-info-300/50"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="speech-upload-dropzone"
      {...dragProps}
      onClick={onBrowse}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center gap-md rounded-2xl border-2 border-dashed px-lg py-12 text-center transition-all",
        isDragging
          ? "border-info-300/70 bg-info-500/15 shadow-[0_0_32px_rgba(34,211,238,0.25)]"
          : "border-info-500/35 bg-info-950/25 hover:border-info-400/55",
      )}
      role="button"
      aria-label="Upload speech recording"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onBrowse()}
    >
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border transition-all",
          isDragging
            ? "border-info-300/80 bg-info-500/25 shadow-[0_0_28px_rgba(34,211,238,0.45)]"
            : "border-info-400/45 bg-info-500/10",
        )}
      >
        {isDragging ? (
          <Waves className="h-8 w-8 text-info-200" />
        ) : (
          <Upload className="h-8 w-8 text-info-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="w-full">
        <p className="text-lg font-bold text-foreground">
          {isDragging
            ? "Drop your recording"
            : isTouch
              ? "Tap to upload speech"
              : "Drop voice / podcast / dialogue"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTouch ? (
            ALLOWED_AUDIO_FORMATS_LABEL
          ) : (
            <>
              or{" "}
              <span className="text-info-300 underline decoration-info-400/40 underline-offset-2">
                browse files
              </span>
              {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
            </>
          )}
        </p>
      </div>
      <p className="w-full shrink-0 max-w-md text-[11px] leading-relaxed text-info-200/55">
        For podcasts, voice memos, calls, and dialogue —{" "}
        <span className="font-semibold text-info-100/80">not for songs or full mixes</span>.
      </p>
    </div>
  );
}
