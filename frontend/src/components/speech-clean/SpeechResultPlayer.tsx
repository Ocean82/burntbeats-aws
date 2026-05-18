import { useEffect, useState } from "react";
import { Download, Headphones } from "lucide-react";
import { fetchSpeechWavAsBlob } from "../../api/speech";

export interface SpeechResultPlayerProps {
  outputUrl: string;
  uploadName: string;
}

export function SpeechResultPlayer({ outputUrl, uploadName }: SpeechResultPlayerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    setLoading(true);
    setLoadError(null);
    void fetchSpeechWavAsBlob(outputUrl)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoked = url;
        setBlobUrl(url);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "Could not load enhanced audio");
      })
      .finally(() => setLoading(false));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [outputUrl]);

  const downloadName =
    uploadName.replace(/\.[^.]+$/, "") + "-enhanced.wav";

  return (
    <div
      data-testid="speech-result-player"
      className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-950/20 px-4 py-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Headphones className="h-4 w-4 text-emerald-300" aria-hidden />
        <span className="text-sm font-semibold text-emerald-100">Enhanced speech ready</span>
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
      {blobUrl && !loadError && (
        <>
          <audio controls src={blobUrl} className="mb-3 w-full" preload="metadata">
            Your browser does not support audio playback.
          </audio>
          <a
            href={blobUrl}
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
