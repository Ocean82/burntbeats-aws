import { useEffect, useState } from "react";

/**
 * Reads duration from a local audio file via `<audio>` metadata (browser decode).
 */
export function useAudioFileDuration(file: File | null): number | null {
  const [durationSec, setDurationSec] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setDurationSec(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;

    const onLoaded = () => {
      const d = audio.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        setDurationSec(d);
      } else {
        setDurationSec(null);
      }
    };
    const onErr = () => setDurationSec(null);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onErr);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onErr);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return durationSec;
}
