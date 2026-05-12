import { Upload, Music2, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import { ALLOWED_AUDIO_FORMATS_LABEL } from "../../config";
import { useIsTouchDevice } from "../../hooks/useIsTouchDevice";

export interface UploadDropZoneProps {
  uploadName: string;
  uploadedFile: File | null;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;
}

/** Hero drop zone (no file) + compact file bar (file selected) for split mode. */
export function UploadDropZone({
  uploadName,
  uploadedFile,
  onBrowseUpload,
  onClearUpload,
  onDropUpload,
  isDragging,
  onSetIsDragging,
}: UploadDropZoneProps) {
  const isTouchDevice = useIsTouchDevice();

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
          "dropzone-hero flex w-full cursor-pointer flex-col items-center justify-center gap-4 px-6 py-14 text-center",
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
            ? "border-amber-400/80 bg-amber-500/25 shadow-[0_0_32px_rgba(255,172,92,0.5)]"
            : "border-amber-400/40 bg-amber-500/10 shadow-[0_0_20px_rgba(255,140,80,0.2)]",
        )}>
          {isDragging
            ? <Music2 className="h-8 w-8 text-amber-300" />
            : <Upload className="h-8 w-8 text-amber-400" strokeWidth={1.5} />}
        </div>
        <div>
          <p className="text-lg font-bold text-white">
            {isDragging ? "Drop it!" : isTouchDevice ? "Tap to choose your track" : "Drop your track here"}
          </p>
          <p className="mt-1 text-sm text-white/55">
            {isTouchDevice ? (
              ALLOWED_AUDIO_FORMATS_LABEL
            ) : (
              <>
                or{" "}
                <span className="text-amber-300 underline decoration-amber-400/40 underline-offset-2">
                  click to browse
                </span>
                {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-500/60" />
            AI stem separation
          </span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Vocals · Drums · Bass · Melody</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>60s free sample available</span>
        </div>
      </div>
    );
  }

  // Compact file bar (file selected)
  return (
    <div
      data-testid="split-upload-dropzone"
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
        "mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all",
        "border-white/10 bg-black/20 hover:border-white/20",
        isDragging && "scale-[1.01] border-amber-400/50 bg-amber-950/20",
      )}
    >
      <Upload className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
        {uploadName}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onClearUpload}
          className="min-h-[32px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:border-white/30 hover:text-white"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onBrowseUpload}
          className="min-h-[32px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-white/30 hover:text-white"
        >
          Change
        </button>
      </div>
    </div>
  );
}
