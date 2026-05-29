/**
 * Generate and download a shareable 30s preview for a stem-split job.
 */
import { useCallback, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { generatePreview, downloadPreview } from "../api/preview";
import { cn } from "../utils/cn";

export interface SharePreviewButtonProps {
  jobId: string | null;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function SharePreviewButton({
  jobId,
  disabled = false,
  className,
  label = "Share preview",
}: SharePreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!jobId || loading) return;
    setError(null);
    setLoading(true);
    try {
      const created = await generatePreview(jobId);
      const suffix = created.watermarked ? "preview" : "clean_preview";
      await downloadPreview(
        created.preview_id,
        `burntbeats_${suffix}_${created.preview_id.slice(0, 8)}.mp3`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [jobId, loading]);

  if (!jobId) return null;

  return (
    <div className={cn("flex flex-col gap-2xs", className)}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || loading}
        className="ghost-button tap-feedback inline-flex min-h-[44px] items-center justify-center gap-xs rounded-lg border border-border px-sm py-xs text-xs font-medium text-secondary-foreground transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-100 disabled:opacity-45"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Link2 className="h-3.5 w-3.5" aria-hidden />
        )}
        {loading ? "Generating…" : label}
      </button>
      {error && (
        <p className="text-xs text-destructive-300/90" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
