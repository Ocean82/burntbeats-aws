/**
 * MidiSourcePreview — play source audio before MIDI conversion.
 */
import { useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { fetchStemWavAsBlob } from "../../api/stems";
import type { MidiSourceMode } from "../../hooks/useMidiConvert";
import { useAudioFileDuration } from "../../hooks/useAudioFileDuration";
import { formatUploadMeta } from "../../utils/formatFileMeta";

interface MidiSourcePreviewProps {
  sourceMode: MidiSourceMode;
  uploadedFile: File | null;
  splitStemUrl: string | null;
  loadedStemUrl: string | null;
  loadedStemLabel?: string;
  disabled?: boolean;
}

export function MidiSourcePreview({
  sourceMode,
  uploadedFile,
  splitStemUrl,
  loadedStemUrl,
  loadedStemLabel,
  disabled = false,
}: MidiSourcePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const durationSec = useAudioFileDuration(
    sourceMode === "upload" ? uploadedFile : null,
  );

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    const load = async () => {
      setLoadError(null);
      setPreviewUrl(null);

      if (sourceMode === "upload" && uploadedFile) {
        const url = URL.createObjectURL(uploadedFile);
        revoke = url;
        if (!cancelled) setPreviewUrl(url);
        return;
      }

      if (sourceMode === "loaded" && loadedStemUrl) {
        if (!cancelled) setPreviewUrl(loadedStemUrl);
        return;
      }

      if (sourceMode === "split" && splitStemUrl) {
        setLoading(true);
        try {
          const blob = await fetchStemWavAsBlob(splitStemUrl);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          revoke = url;
          setPreviewUrl(url);
        } catch {
          if (!cancelled) setLoadError("Could not load stem preview.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revoke && revoke !== loadedStemUrl) {
        URL.revokeObjectURL(revoke);
      }
    };
  }, [sourceMode, uploadedFile, splitStemUrl, loadedStemUrl]);

  const hasSource =
    (sourceMode === "upload" && uploadedFile) ||
    (sourceMode === "split" && splitStemUrl) ||
    (sourceMode === "loaded" && loadedStemUrl);

  if (!hasSource) return null;

  const metaLine =
    sourceMode === "upload" && uploadedFile
      ? formatUploadMeta({ sizeBytes: uploadedFile.size, durationSec })
      : loadedStemLabel
        ? loadedStemLabel
        : null;

  return (
    <div
      data-testid="midi-source-preview"
      className="flex flex-col gap-xs rounded-xl border border-accent-midi/25 bg-accent-midi-950/20 px-md py-sm"
    >
      <div className="flex items-center gap-xs text-xs font-medium uppercase tracking-wide text-accent-midi-200/70">
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
        Source preview
        {metaLine && (
          <span className="normal-case font-normal text-muted-foreground truncate">{metaLine}</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-xs text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading audio…
        </div>
      )}

      {loadError && (
        <p className="text-sm text-destructive-300/90" role="alert">
          {loadError}
        </p>
      )}

      {previewUrl && !loading && !loadError && (
        /* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental preview; no speech captions */
        <audio
          key={previewUrl}
          src={previewUrl}
          controls
          preload="metadata"
          className="w-full max-w-full"
          aria-label="Preview source audio before MIDI conversion"
          {...(disabled ? { "aria-disabled": true } : {})}
        />
      )}
    </div>
  );
}
