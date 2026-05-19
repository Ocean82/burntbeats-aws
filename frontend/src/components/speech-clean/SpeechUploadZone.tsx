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
          "mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all",
          "border-cyan-400/25 bg-cyan-950/20 hover:border-cyan-400/40",
          isDragging && "scale-[1.01] border-cyan-300/60 bg-cyan-950/35",
        )}
      >
        <Mic className="h-4 w-4 shrink-0 text-cyan-300/80" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {uploadName}
          </span>
          {metaLine ? (
            <span
              className="mt-0.5 block truncate text-xs tabular-nums text-cyan-200/50"
              aria-label={`File details: ${metaLine}`}
            >
              {metaLine}
            </span>
          ) : (
            <span className="mt-0.5 block h-4 text-xs text-white/30" aria-hidden>
              Reading file info…
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="min-h-[32px] rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:border-white/30 hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onBrowse}
            className="min-h-[32px] rounded-lg border border-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-100/90 hover:border-cyan-300/50"
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
        "flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all",
        isDragging
          ? "border-cyan-300/70 bg-cyan-500/15 shadow-[0_0_32px_rgba(34,211,238,0.25)]"
          : "border-cyan-500/35 bg-cyan-950/25 hover:border-cyan-400/55",
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
            ? "border-cyan-300/80 bg-cyan-500/25 shadow-[0_0_28px_rgba(34,211,238,0.45)]"
            : "border-cyan-400/45 bg-cyan-500/10",
        )}
      >
        {isDragging ? (
          <Waves className="h-8 w-8 text-cyan-200" />
        ) : (
          <Upload className="h-8 w-8 text-cyan-300" strokeWidth={1.5} />
        )}
      </div>
      <div>
        <p className="text-lg font-bold text-white">
          {isDragging
            ? "Drop your recording"
            : isTouch
              ? "Tap to upload speech"
              : "Drop voice / podcast / dialogue"}
        </p>
        <p className="mt-1 text-sm text-white/55">
          {isTouch ? (
            ALLOWED_AUDIO_FORMATS_LABEL
          ) : (
            <>
              or{" "}
              <span className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2">
                browse files
              </span>
              {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
            </>
          )}
        </p>
      </div>
      <p className="max-w-md text-[11px] leading-relaxed text-cyan-200/55">
        For podcasts, voice memos, calls, and dialogue —{" "}
        <span className="font-semibold text-cyan-100/80">not for songs or full mixes</span>.
      </p>
    </div>
  );
}
