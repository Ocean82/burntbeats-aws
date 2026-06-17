import { Music2, X } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SplitQuality } from "../../api";
import { formatUploadMeta } from "../../utils/formatFileMeta";

export interface SourceFileHeaderProps {
  uploadName: string;
  uploadedFile: File | null;
  durationSec?: number | null;
  estimatedTokens?: number | null;
  quality: SplitQuality;
  onQualityChange: (q: SplitQuality) => void;
  canChoosePaidQuality: boolean;
  onClearUpload: () => void;
  onBrowseUpload: () => void;
}

export function SourceFileHeader({
  uploadName,
  uploadedFile,
  durationSec = null,
  estimatedTokens = null,
  quality,
  onQualityChange,
  canChoosePaidQuality,
  onClearUpload,
  onBrowseUpload,
}: SourceFileHeaderProps) {
  if (!uploadedFile) return null;

  const metaLine = formatUploadMeta({
    sizeBytes: uploadedFile?.size,
    durationSec,
    estimatedTokens,
  });

  return (
    <div className="flex items-center gap-sm rounded-xl border border-border bg-muted px-md py-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15">
        <Music2 className="h-4 w-4 text-primary-400" />
      </div>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {uploadName}
        </span>
        {metaLine ? (
          <span className="block truncate text-xs tabular-nums text-muted-foreground">
            {metaLine}
          </span>
        ) : (
          <span className="block h-3 text-xs text-muted-foreground" aria-hidden>
            Reading file info…
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-neutral-900/60 p-0.5">
        <button
          type="button"
          onClick={() => onQualityChange("speed")}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            quality === "speed"
              ? "bg-primary-500/20 text-primary-200"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Fast
        </button>
        <span className="text-[10px] text-muted-foreground/40">|</span>
        <button
          type="button"
          onClick={() => onQualityChange("quality")}
          disabled={!canChoosePaidQuality}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            !canChoosePaidQuality && "cursor-not-allowed text-muted-foreground/40",
            quality === "quality" && canChoosePaidQuality
              ? "bg-primary-500/20 text-primary-200"
              : !canChoosePaidQuality
                ? "text-muted-foreground/40"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          Quality
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onBrowseUpload}
          className="tap-feedback rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Change
        </button>
        <button
          type="button"
          onClick={onClearUpload}
          className="tap-feedback flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-destructive-500/10"
          aria-label="Clear file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
