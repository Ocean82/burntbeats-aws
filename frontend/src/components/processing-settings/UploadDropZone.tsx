import { Upload, Music2, Sparkles, Play } from "lucide-react";
import { cn } from "../../utils/cn";
import { ALLOWED_AUDIO_FORMATS_LABEL } from "../../config";
import { useIsTouchDevice } from "../../hooks/useIsTouchDevice";
import { formatUploadMeta } from "../../utils/formatFileMeta";
import { DEMO_TRACK_ENABLED } from "../../data/demoTrack";

export interface UploadDropZoneProps {
  uploadName: string;
  uploadedFile: File | null;
  durationSec?: number | null;
  estimatedTokens?: number | null;
  isSample?: boolean;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;
  /** Callback to load the demo track into the mixer */
  onLoadDemo?: () => void;
}

/** Hero drop zone (no file) + compact file bar (file selected) for split mode. */
export function UploadDropZone({
  uploadName,
  uploadedFile,
  durationSec = null,
  estimatedTokens = null,
  isSample = false,
  onBrowseUpload,
  onClearUpload,
  onDropUpload,
  isDragging,
  onSetIsDragging,
  onLoadDemo,
}: UploadDropZoneProps) {
  const isTouchDevice = useIsTouchDevice();
  const metaLine = formatUploadMeta({
    sizeBytes: uploadedFile?.size,
    durationSec,
    estimatedTokens,
    isSample,
  });

  if (!uploadedFile) {
    return (
      <div
        data-testid="split-upload-dropzone"
        onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
        onDragLeave={() => onSetIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          onSetIsDragging(false);
          onDropUpload(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={onBrowseUpload}
        className={cn(
          "dropzone-hero flex w-full cursor-pointer flex-col items-center justify-center gap-md px-lg py-14 text-center",
          isDragging && "dropzone-dragging",
        )}
        role="button"
        aria-label="Upload audio file"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onBrowseUpload()}
      >
        <div className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-300",
          isDragging
            ? "border-primary-400/80 bg-primary-500/25 shadow-[0_0_32px_rgba(255,172,92,0.5)]"
            : "border-primary-400/40 bg-primary-500/10 shadow-[0_0_20px_rgba(255,140,80,0.2)]",
        )}>
          {isDragging
            ? <Music2 className="h-8 w-8 text-primary-300" />
            : <Upload className="h-8 w-8 text-primary-400" strokeWidth={1.5} />}
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">
            {isDragging ? "Drop it!" : isTouchDevice ? "Tap to choose your track" : "Drop your track here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTouchDevice ? (
              ALLOWED_AUDIO_FORMATS_LABEL
            ) : (
              <>
                or{" "}
                <span className="text-primary-300 underline decoration-primary-400/40 underline-offset-2">
                  click to browse
                </span>
                {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-sm text-helper text-muted-foreground">
          <span className="flex items-center gap-xs">
            <Sparkles className="h-3 w-3 text-primary-500/60" />
            AI stem separation
          </span>
          <span className="h-1 w-1 rounded-full bg-secondary" />
          <span>Vocals · Drums · Bass · Melody</span>
          <span className="h-1 w-1 rounded-full bg-secondary" />
          <span>60s free sample available</span>
        </div>
        {DEMO_TRACK_ENABLED && onLoadDemo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLoadDemo();
            }}
            className="mt-xs inline-flex items-center gap-xs rounded-full border border-info-400/30 bg-info-500/10 px-md py-xs text-xs font-semibold text-info-200 transition hover:border-info-400/50 hover:bg-info-500/20"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            Try a demo track
          </button>
        )}
      </div>
    );
  }

  // Compact file bar (file selected)
  return (
    <div
      data-testid="split-upload-dropzone"
      data-tour="upload-dropzone"
      role="region"
      aria-label="Upload drop zone — drag a new file here to replace"
      onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
      onDragLeave={() => onSetIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        onSetIsDragging(false);
        onDropUpload(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        "mb-sm flex w-full items-center justify-between gap-sm rounded-xl border px-md py-sm transition-all",
        "border-border bg-muted hover:border-border",
        isDragging && "scale-[1.01] border-primary-400/50 bg-primary-950/20",
      )}
    >
      <Upload className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {uploadName}
        </span>
        {metaLine ? (
          <span
            className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground"
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
      <div className="ml-auto flex shrink-0 items-center gap-xs">
        <button
          type="button"
          onClick={onClearUpload}
          className="min-h-[32px] whitespace-nowrap rounded-lg border border-border px-sm py-1 text-xs text-muted-foreground hover:border-border hover:text-foreground"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onBrowseUpload}
          className="min-h-[32px] whitespace-nowrap rounded-lg border border-border px-sm py-1 text-xs font-semibold text-muted-foreground hover:border-border hover:text-foreground"
        >
          Change
        </button>
      </div>
    </div>
  );
}
