/**
 * MidiWaveformPlayer — custom audio player with animated waveform, playhead, and scrub.
 * Replaces the native <audio controls> in MidiSourcePreview.
 * Adapted from pitch-tempo-plugin WaveformDisplay, themed to midi-gold.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "../../../utils/cn";
import { MidiPhysicalButton } from "./MidiPhysicalButton";
import "../midi-tokens.css";

export interface MidiWaveformPlayerProps {
  /** URL to the audio source (blob URL or remote). */
  src: string | null;
  /** Optional label displayed above the player. */
  label?: string;
  className?: string;
  disabled?: boolean;
}

// Colors matching the midi-gold token system
const WAVEFORM_COLOR = "rgba(205, 165, 60, 0.85)";
const WAVEFORM_GLOW = "rgba(205, 165, 60, 0.35)";
const PLAYHEAD_COLOR = "rgba(255, 111, 76, 0.95)";
const PLAYHEAD_GLOW = "rgba(255, 111, 76, 0.4)";
const BG_COLOR = "#131210"; // --midi-surface-inset
const PROGRESS_TINT = "rgba(205, 165, 60, 0.06)";

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Renders waveform + playhead onto a canvas. Pure function, no hooks. */
function renderWaveform(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  time: number,
  dur: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const step = Math.ceil(data.length / W);
  const mid = H / 2;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  if (dur > 0) {
    const progressX = (time / dur) * W;
    ctx.fillStyle = PROGRESS_TINT;
    ctx.fillRect(0, 0, progressX, H);
  }

  ctx.strokeStyle = "rgba(255, 245, 220, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(W, mid);
  ctx.stroke();

  ctx.strokeStyle = WAVEFORM_COLOR;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = WAVEFORM_GLOW;
  ctx.shadowBlur = 3;
  ctx.beginPath();

  for (let x = 0; x < W; x++) {
    let min = 1;
    let max = -1;
    for (let j = 0; j < step; j++) {
      const sample = data[x * step + j] ?? 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    const yMin = ((1 + min) / 2) * H;
    const yMax = ((1 + max) / 2) * H;
    if (x === 0) ctx.moveTo(x, yMin);
    ctx.lineTo(x, yMax);
    ctx.lineTo(x, yMin);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (dur > 0 && time > 0) {
    const phX = (time / dur) * W;
    ctx.strokeStyle = PLAYHEAD_COLOR;
    ctx.lineWidth = 2;
    ctx.shadowColor = PLAYHEAD_GLOW;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(phX, 0);
    ctx.lineTo(phX, H);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/**
 * Internal sub-component that mounts only when src is provided.
 * This avoids all reset-state-on-null issues and keeps effects clean.
 */
function MidiWaveformPlayerInner({
  src,
  label,
  className,
  disabled,
}: {
  src: string;
  label?: string;
  className?: string;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const waveformDataRef = useRef<Float32Array | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const draw = useCallback((time: number, dur: number) => {
    const canvas = canvasRef.current;
    const data = waveformDataRef.current;
    if (!canvas || !data || !data.length) return;
    renderWaveform(canvas, data, time, dur);
  }, []);

  // Load audio and decode waveform
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.preload = "metadata";
        audio.src = src;
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => resolve();
          audio.onerror = () => reject(new Error("Failed to load audio"));
        });
        if (cancelled) return;
        setDuration(audio.duration);

        const response = await fetch(src, { signal: controller.signal });
        if (cancelled) return;
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const audioCtx = new AudioContext();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();
        if (cancelled) return;

        waveformDataRef.current = buffer.getChannelData(0);
        setStatus("ready");
        draw(0, audio.duration);
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : "Load failed");
          setStatus("error");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [src, draw]);

  // Animation loop during playback
  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);
      draw(audio.currentTime, audio.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, draw]);

  // Redraw on seek (when not playing)
  useEffect(() => {
    if (!isPlaying && duration > 0) {
      draw(currentTime, duration);
    }
  }, [currentTime, duration, isPlaying, draw]);

  // Play / pause
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || disabled) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying, disabled]);

  // Handle audio end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      draw(0, audio.duration);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [src, draw]);

  // Scrub on canvas click
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const audio = audioRef.current;
      const canvas = canvasRef.current;
      if (!audio || !canvas || disabled || duration <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const seekTime = ratio * duration;
      audio.currentTime = seekTime;
      setCurrentTime(seekTime);
      draw(seekTime, duration);
    },
    [disabled, duration, draw],
  );

  return (
    <div className={cn("midi-waveform-player flex flex-col gap-xs", className)}>
      {label && <span className="midi-knob__label px-1">{label}</span>}

      {status === "loading" && (
        <div className="flex items-center justify-center gap-xs h-16 rounded-lg border border-border/50 bg-[var(--midi-surface-inset)]">
          <Loader2 className="h-4 w-4 animate-spin text-accent-midi-300" aria-hidden />
          <span className="text-xs text-muted-foreground">Loading waveform…</span>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center justify-center h-16 rounded-lg border border-destructive-500/30 bg-destructive-950/20 text-xs text-destructive-300">
          {errorMsg ?? "Load failed"}
        </div>
      )}

      {status === "ready" && (
        <>
          <canvas
            ref={canvasRef}
            width={600}
            height={64}
            className="w-full h-16 rounded-lg border border-[var(--midi-border)] cursor-pointer"
            role="slider"
            aria-label="Audio waveform — click to seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            tabIndex={0}
            onClick={handleCanvasClick}
          />

          <div className="flex items-center gap-sm">
            <MidiPhysicalButton
              variant="play"
              onClick={togglePlayback}
              disabled={disabled || duration <= 0}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5 fill-current" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
              )}
            </MidiPhysicalButton>

            <span className="midi-time-display text-xs tabular-nums">
              {formatTime(currentTime)}
              <span className="opacity-45"> / </span>
              {formatTime(duration)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function MidiWaveformPlayer({
  src,
  label,
  className,
  disabled = false,
}: MidiWaveformPlayerProps) {
  // Key on src ensures full remount (clean state) when source changes
  if (!src) return null;
  return (
    <MidiWaveformPlayerInner
      key={src}
      src={src}
      label={label}
      className={className}
      disabled={disabled}
    />
  );
}
