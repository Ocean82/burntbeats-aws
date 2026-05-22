import { useEffect, useRef, useState } from "react";
import { Download, Headphones } from "lucide-react";
import { fetchSpeechWavAsBlob } from "../../api/speech";
import { cn } from "../../utils/cn";

export type SpeechPlaybackMode = "original" | "enhanced";

export interface SpeechResultPlayerProps {
  outputUrl: string;
  uploadName: string;
  originalBlobUrl: string | null;
}

function SpeechResultPlayerInner({
  outputUrl,
  uploadName,
  originalBlobUrl,
}: SpeechResultPlayerProps) {
  const [enhancedBlobUrl, setEnhancedBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchDone, setFetchDone] = useState(false);
  const [mode, setMode] = useState<SpeechPlaybackMode>("enhanced");
  const audioRef = useRef<HTMLAudioElement>(null);

  const loading = !fetchDone;

  useEffect(() => {
    let revoked: string | null = null;
    void fetchSpeechWavAsBlob(outputUrl)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoked = url;
        setEnhancedBlobUrl(url);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "Could not load enhanced audio");
      })
      .finally(() => setFetchDone(true));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [outputUrl]);

  const activeUrl =
    mode === "original" ? originalBlobUrl : enhancedBlobUrl;

  const downloadName =
    uploadName.replace(/\.[^.]+$/, "") + "-enhanced.wav";

  const switchMode = (next: SpeechPlaybackMode) => {
    const audio = audioRef.current;
    const time = audio?.currentTime ?? 0;
    setMode(next);
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (el) {
        el.currentTime = time;
        void el.play().catch(() => {});
      }
    });
  };

  return (
    <div
      data-testid="speech-result-player"
      className="mt-md rounded-xl border border-success-400/30 bg-success-950/20 px-md py-md"
    >
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-xs">
          <Headphones className="h-4 w-4 text-success-300" aria-hidden />
          <span className="text-sm font-semibold text-success-100">Enhanced speech ready</span>
        </div>
        {originalBlobUrl && enhancedBlobUrl && !loadError && (
          <div
            className="inline-flex rounded-lg border border-success-400/30 bg-muted p-0.5"
            role="group"
            aria-label="Compare original and enhanced"
          >
            <button
              type="button"
              onClick={() => switchMode("original")}
              aria-pressed={mode === "original"}
              className={cn(
                "min-h-[36px] rounded-md px-sm py-1.5 text-xs font-semibold transition",
                mode === "original"
                  ? "bg-success-500/30 text-success-50"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => switchMode("enhanced")}
              aria-pressed={mode === "enhanced"}
              className={cn(
                "min-h-[36px] rounded-md px-sm py-1.5 text-xs font-semibold transition",
                mode === "enhanced"
                  ? "bg-success-500/30 text-success-50"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              Enhanced
            </button>
          </div>
        )}
      </div>
      {loading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading preview…
        </p>
      )}
      {loadError && (
        <p className="text-sm text-destructive-300" role="alert">
          {loadError}
        </p>
      )}
      {activeUrl && !loadError && (
        <>
          <audio
            ref={audioRef}
            key={mode}
            controls
            src={activeUrl}
            className="mb-sm w-full"
            preload="metadata"
            aria-label={`${mode === "original" ? "Original" : "Enhanced"} preview of ${uploadName}`}
          >
            <track kind="captions" label="Captions unavailable" />
            Your browser does not support audio playback.
          </audio>
          <a
            href={enhancedBlobUrl ?? activeUrl}
            download={downloadName}
            className="inline-flex min-h-[40px] items-center gap-xs rounded-lg border border-success-400/40 bg-success-500/15 px-md py-xs text-sm font-semibold text-success-100 hover:bg-success-500/25"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download enhanced WAV
          </a>
        </>
      )}
    </div>
  );
}

/** Remount when output changes so fetch state resets without sync setState in effects. */
export function SpeechResultPlayer(props: SpeechResultPlayerProps) {
  return <SpeechResultPlayerInner key={props.outputUrl} {...props} />;
}
