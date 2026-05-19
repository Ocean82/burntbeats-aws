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
      className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-950/20 px-4 py-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-emerald-300" aria-hidden />
          <span className="text-sm font-semibold text-emerald-100">Enhanced speech ready</span>
        </div>
        {originalBlobUrl && enhancedBlobUrl && !loadError && (
          <div
            className="inline-flex rounded-lg border border-emerald-400/30 bg-black/25 p-0.5"
            role="group"
            aria-label="Compare original and enhanced"
          >
            <button
              type="button"
              onClick={() => switchMode("original")}
              aria-pressed={mode === "original"}
              className={cn(
                "min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition",
                mode === "original"
                  ? "bg-emerald-500/30 text-emerald-50"
                  : "text-white/55 hover:text-white/80",
              )}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => switchMode("enhanced")}
              aria-pressed={mode === "enhanced"}
              className={cn(
                "min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition",
                mode === "enhanced"
                  ? "bg-emerald-500/30 text-emerald-50"
                  : "text-white/55 hover:text-white/80",
              )}
            >
              Enhanced
            </button>
          </div>
        )}
      </div>
      {loading && (
        <p className="text-sm text-white/50" role="status">
          Loading preview…
        </p>
      )}
      {loadError && (
        <p className="text-sm text-red-300" role="alert">
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
            className="mb-3 w-full"
            preload="metadata"
            aria-label={`${mode === "original" ? "Original" : "Enhanced"} preview of ${uploadName}`}
          >
            <track kind="captions" label="Captions unavailable" />
            Your browser does not support audio playback.
          </audio>
          <a
            href={enhancedBlobUrl ?? activeUrl}
            download={downloadName}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
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
