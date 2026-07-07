import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { SignUpButton } from "@clerk/react";
import { motion, useReducedMotion } from "framer-motion";
import { brandScrollSection } from "../../motion/brandPresets";
import { trackEvent } from "../../analytics/events";

type StemId = "mix" | "vocals" | "drums" | "bass" | "other";

interface StemOption {
  id: StemId;
  label: string;
  src: string;
  colorClass: string;
}

const STEM_OPTIONS: StemOption[] = [
  { id: "mix", label: "Full mix", src: "/demo/mix.mp3", colorClass: "bg-primary-500" },
  { id: "vocals", label: "Vocals", src: "/demo/vocals.mp3", colorClass: "bg-[var(--stem-vocals)]" },
  { id: "drums", label: "Drums", src: "/demo/drums.mp3", colorClass: "bg-[var(--stem-drums)]" },
  { id: "bass", label: "Bass", src: "/demo/bass.mp3", colorClass: "bg-[var(--stem-bass)]" },
  { id: "other", label: "Melody", src: "/demo/other.mp3", colorClass: "bg-[var(--stem-melody)]" },
];

export function LandingAudioDemo() {
  const reduceMotion = useReducedMotion() ?? false;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeStem, setActiveStem] = useState<StemId>("mix");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const activeOption = STEM_OPTIONS.find((s) => s.id === activeStem) ?? STEM_OPTIONS[0];

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const selectStem = useCallback(
    (stemId: StemId) => {
      if (stemId === activeStem) return;
      stopPlayback();
      setActiveStem(stemId);
      setLoadError(false);
      trackEvent("landing_demo_stem_selected", { stem: stemId });
    },
    [activeStem, stopPlayback],
  );

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || loadError) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
      trackEvent("landing_demo_play", { stem: activeStem });
    } catch {
      setLoadError(true);
      setIsPlaying(false);
    }
  }, [activeStem, isPlaying, loadError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setLoadError(true);
      setIsPlaying(false);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
    setIsPlaying(false);
  }, [activeOption.src]);

  return (
    <motion.section
      aria-labelledby="landing-demo-title"
      id="demo"
      className="w-full scroll-mt-20 py-[clamp(2rem,4vw,3rem)]"
      {...brandScrollSection(reduceMotion)}
    >
      <div className="glass-panel mirror-sheen rounded-3xl border border-border/60 p-md sm:p-lg">
        <div className="mb-md flex flex-wrap items-end justify-between gap-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary-200/80">
              Hear it first
            </p>
            <h2
              id="landing-demo-title"
              className="mt-1 font-display text-[clamp(1.15rem,2.5vw,1.6rem)] font-bold text-secondary-foreground"
            >
              Real stem separation — 20 second preview
            </h2>
            <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
              No signup required. Toggle stems to hear what Burnt Beats produces, then upload your own track.
            </p>
          </div>
          <Volume2 className="hidden h-5 w-5 text-muted-foreground sm:block" aria-hidden="true" />
        </div>

        <div className="flex flex-wrap gap-2">
          {STEM_OPTIONS.map((stem) => {
            const isActive = stem.id === activeStem;
            return (
              <button
                key={stem.id}
                type="button"
                onClick={() => selectStem(stem.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-md py-xs text-sm font-medium transition ${
                  isActive
                    ? "border-primary-400/50 bg-primary-500/15 text-primary-100"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
                aria-pressed={isActive ? "true" : "false"}
              >
                <span className={`h-2 w-2 rounded-full ${stem.colorClass}`} aria-hidden="true" />
                {stem.label}
              </button>
            );
          })}
        </div>

        <div className="mt-md flex flex-wrap items-center gap-md">
          <button
            type="button"
            onClick={() => void togglePlay()}
            disabled={loadError}
            className="fire-button tap-feedback inline-flex items-center gap-2 px-lg py-sm text-sm font-semibold disabled:opacity-50"
            aria-label={isPlaying ? "Pause preview" : "Play preview"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? "Pause" : "Play preview"}
          </button>

          <SignUpButton mode="modal" fallbackRedirectUrl="/app">
            <button
              type="button"
              onClick={() => trackEvent("landing_demo_signup_click", { stem: activeStem })}
              className="ghost-button tap-feedback px-lg py-sm text-sm font-semibold"
            >
              Split your own track — free
            </button>
          </SignUpButton>
        </div>

        {loadError && (
          <p className="mt-sm text-sm text-error-red" role="status">
            Preview could not load. Sign up to try a live split in the app.
          </p>
        )}

        <audio ref={audioRef} src={activeOption.src} preload="metadata" className="sr-only">
          <track kind="captions" />
        </audio>
      </div>
    </motion.section>
  );
}
