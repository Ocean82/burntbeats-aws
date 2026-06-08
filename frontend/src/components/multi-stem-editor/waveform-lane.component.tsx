import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MixerState, StemDefinition, TrimState } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
import { drawWaveformBars } from "../../utils/waveformCanvas";
import type { SeekPhase } from "../../types/playbackSeek";

const BAR_BUDGET = 300;
const HANDLE_HIT_PX = 12;
const MIN_TRIM_GAP_PCT = 2;
const NO_SEEK_SELECTOR =
  "button,input,label,select,textarea,a,[role='toolbar'],[data-no-seek]";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function downsample(data: number[], budget: number): number[] {
  if (data.length <= budget) return data;
  const result: number[] = [];
  const step = data.length / budget;
  for (let index = 0; index < budget; index++) {
    const start = Math.floor(index * step);
    const end = Math.min(data.length, Math.ceil((index + 1) * step));
    let sum = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) sum += data[sampleIndex];
    result.push(sum / (end - start));
  }
  return result;
}

export interface WaveformLaneProps {
  stem: StemDefinition;
  waveform: number[];
  trim: TrimState;
  mixer: MixerState;
  isActive: boolean;
  isMuted: boolean;
  isSoloed: boolean;
  /** When true, renders with a shimmer overlay to indicate loading state. */
  isLoading?: boolean;
  /** When false, trim/seek and quick gain do not run (no decoded audio yet). */
  audioReady?: boolean;
  zoom: number;
  scrollPct: number;
  /** 0–1 fraction of the visible lane width considered "played". */
  playheadFraction?: number;
  /** Live analyser time-domain data for waveform modulation during playback. */
  getAnalyserData?: () => Uint8Array | null;
  /** Fade-in duration in seconds. */
  fadeIn?: number;
  /** Fade-out duration in seconds. */
  fadeOut?: number;
  /** Total decoded buffer duration in seconds (for computing fade width). */
  duration?: number;
  onTrimChange: (stemId: string, trim: TrimState) => void;
  /** `phase`: `move` during drag (throttled seek); `end` on pointer release (always applies). */
  onSeek: (pct: number, opts?: { phase?: SeekPhase }) => void;
  onActivate: (stemId: string) => void;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

export function WaveformLane({
  stem,
  waveform,
  trim,
  mixer,
  isActive,
  isMuted,
  isSoloed,
  isLoading = false,
  audioReady = true,
  zoom,
  scrollPct,
  playheadFraction,
  getAnalyserData,
  fadeIn = 0,
  fadeOut = 0,
  duration = 0,
  onTrimChange,
  onSeek,
  onActivate,
  onStemStateChange,
}: WaveformLaneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<"start" | "end" | "seek" | null>(null);
  const didDragRef = useRef(false);
  const trimRef = useRef(trim);
  const stemIdRef = useRef(stem.id);
  const onTrimChangeRef = useRef(onTrimChange);
  const onSeekRef = useRef(onSeek);
  const lastSeekPctRef = useRef(0);
  const visibleStartRef = useRef(0);
  const visibleRangeRef = useRef(1);
  const activePointerIdRef = useRef<number | null>(null);
  // Which trim handle is actively being dragged (drives the live timecode bubble + expanded grip).
  const [activeHandle, setActiveHandle] = useState<"start" | "end" | null>(null);
  // Which trim handle is hovered (drives the hover-expand affordance on pointer devices).
  const [hoveredHandle, setHoveredHandle] = useState<"start" | "end" | null>(null);

  // eslint-disable-next-line react-hooks/refs -- sync ref with latest prop for stable callbacks
  trimRef.current = trim;
  // eslint-disable-next-line react-hooks/refs -- sync ref with latest prop for stable callbacks
  stemIdRef.current = stem.id;
  // eslint-disable-next-line react-hooks/refs -- sync ref with latest prop for stable callbacks
  onTrimChangeRef.current = onTrimChange;
  // eslint-disable-next-line react-hooks/refs -- sync ref with latest prop for stable callbacks
  onSeekRef.current = onSeek;

  const visibleStart = scrollPct / 100;
  const visibleEnd = Math.min(1, visibleStart + 1 / zoom);
  const visibleRange = Math.max(visibleEnd - visibleStart, 1e-6);
  // eslint-disable-next-line react-hooks/refs -- sync derived value for stable callbacks
  visibleStartRef.current = visibleStart;
  // eslint-disable-next-line react-hooks/refs -- sync derived value for stable callbacks
  visibleRangeRef.current = visibleRange;

  const hitTestHandle = useCallback((clientX: number): "start" | "end" | "seek" => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return "seek";
    const toPixel = (pct: number) => {
      const fraction = clamp((pct / 100 - visibleStart) / visibleRange, 0, 1);
      return fraction * rect.width;
    };
    const mouseX = clientX - rect.left;
    const distanceStart = Math.abs(mouseX - toPixel(trim.start));
    const distanceEnd = Math.abs(mouseX - toPixel(trim.end));
    // When both handles are within hit range, prefer the closer one.
    // On tie, prefer the handle in the direction of the click relative to the midpoint.
    if (distanceStart <= HANDLE_HIT_PX && distanceEnd <= HANDLE_HIT_PX) {
      if (distanceStart < distanceEnd) return "start";
      if (distanceEnd < distanceStart) return "end";
      const midPx = (toPixel(trim.start) + toPixel(trim.end)) / 2;
      return mouseX <= midPx ? "start" : "end";
    }
    if (distanceStart <= HANDLE_HIT_PX) return "start";
    if (distanceEnd <= HANDLE_HIT_PX) return "end";
    return "seek";
  }, [trim.start, trim.end, visibleStart, visibleRange]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!audioReady) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(NO_SEEK_SELECTOR)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const mode = hitTestHandle(event.clientX);
    draggingRef.current = mode;
    activePointerIdRef.current = event.pointerId;
    laneRef.current?.setPointerCapture?.(event.pointerId);

    if (mode === "start" || mode === "end") {
      setActiveHandle(mode);
    } else if (mode === "seek") {
      didDragRef.current = true;
      const rect = laneRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        const raw = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const pct = clamp(visibleStart + raw * visibleRange, 0, 1) * 100;
        lastSeekPctRef.current = pct;
        onSeekRef.current(pct, { phase: "move" });
      }
    }
  }, [audioReady, hitTestHandle, visibleStart, visibleRange]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current || activePointerIdRef.current !== event.pointerId) return;
      didDragRef.current = true;
      const rect = laneRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const raw = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const pct = clamp(visibleStartRef.current + raw * visibleRangeRef.current, 0, 1) * 100;
      const latestTrim = trimRef.current;
      if (draggingRef.current === "start") {
        onTrimChangeRef.current(stemIdRef.current, {
          start: clamp(pct, 0, latestTrim.end - MIN_TRIM_GAP_PCT),
          end: latestTrim.end,
        });
      } else if (draggingRef.current === "end") {
        onTrimChangeRef.current(stemIdRef.current, {
          start: latestTrim.start,
          end: clamp(pct, latestTrim.start + MIN_TRIM_GAP_PCT, 100),
        });
      } else {
        lastSeekPctRef.current = pct;
        onSeekRef.current(pct, { phase: "move" });
      }
    };
    const onUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      const lane = laneRef.current;
      if (lane?.hasPointerCapture?.(event.pointerId)) {
        lane.releasePointerCapture(event.pointerId);
      }
      activePointerIdRef.current = null;
      const mode = draggingRef.current;
      draggingRef.current = null;
      setActiveHandle(null);
      if (mode === "seek") {
        onSeekRef.current(lastSeekPctRef.current, { phase: "end" });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const slice = useMemo(() => {
    const start = clamp(Math.floor(visibleStart * waveform.length), 0, waveform.length);
    const end = clamp(Math.ceil(visibleEnd * waveform.length), start, waveform.length);
    return downsample(waveform.slice(start, end), BAR_BUDGET);
  }, [waveform, visibleStart, visibleEnd]);

  const toVisible = (pct: number) => clamp((pct / 100 - visibleStart) / visibleRange, 0, 1) * 100;
  const trimStartVisible = toVisible(trim.start);
  const trimEndVisible = toVisible(trim.end);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--stem-glow", stem.glow);
    el.style.setProperty("--stem-glow-soft", stem.glowSoft);
    el.style.setProperty("--stem-color", stem.glow);
    el.style.setProperty("--stem-color-soft", stem.glowSoft);
  }, [stem.glow, stem.glowSoft]);

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    lane.style.setProperty("--trim-start-vis", String(trimStartVisible));
    lane.style.setProperty("--trim-end-vis", String(trimEndVisible));
  }, [trimStartVisible, trimEndVisible]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const alpha = isMuted ? 0.3 : isActive ? 0.92 : 0.5;
    // Static waveform layer only; avoid repainting per animation frame.
    drawWaveformBars({
      canvas,
      values: slice,
      color: stem.glow,
      minimumBarHeightPx: 6,
      alphaEven: alpha,
      alphaOdd: isMuted ? 0.3 : isActive ? 0.62 : 0.34,
      gapPx: 1.5,
      heightScale: 0.94,
      centerGapPx: 2,
      // Brighten the region to the left of the playhead so position is scannable at a glance.
      playedFraction: playheadFraction != null ? clamp(playheadFraction, 0, 1) : -1,
    });
  }, [slice, isMuted, isActive, stem.glow, playheadFraction]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastDrawnPlayhead: number | null = null;
    let lastOverlayDrawMs = 0;
    const PLAYHEAD_EPS = 0.0005;
    const ANALYSER_MIN_INTERVAL_MS = 1000 / 30;

    const paintOverlay = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      if (playheadFraction == null) return;
      const x = clamp(playheadFraction, 0, 1) * width;
      let glowAlpha = 0.25;
      if (getAnalyserData) {
        const data = getAnalyserData();
        if (data && data.length > 0) {
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += Math.abs(data[i] - 128);
          }
          const rms = sum / data.length / 128;
          glowAlpha = 0.2 + Math.min(rms, 1) * 0.35;
        }
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${glowAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      lastDrawnPlayhead = playheadFraction;
      lastOverlayDrawMs = performance.now();
    };

    const draw = () => {
      if (document.hidden) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const now = performance.now();
      const playheadMoved =
        playheadFraction == null
          ? lastDrawnPlayhead !== null
          : lastDrawnPlayhead == null ||
            Math.abs(playheadFraction - lastDrawnPlayhead) > PLAYHEAD_EPS;
      const analyserDue =
        !!getAnalyserData &&
        now - lastOverlayDrawMs >= ANALYSER_MIN_INTERVAL_MS;

      if (playheadFraction == null) {
        if (lastDrawnPlayhead !== null) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          lastDrawnPlayhead = null;
        }
        rafId = requestAnimationFrame(draw);
        return;
      }

      if (playheadMoved || analyserDue) {
        paintOverlay();
      }

      rafId = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (!document.hidden && playheadFraction != null) {
        paintOverlay();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playheadFraction, getAnalyserData]);

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full", isMuted && "opacity-40")}
    >
      <div
        className="mb-1 flex justify-end"
        role="toolbar"
        aria-label={`${stem.label} quick mixer`}
      >
        <div
          className="pointer-events-auto flex max-w-[min(100%,11rem)] items-center gap-0.5 rounded-md border border-border bg-secondary px-0.5 py-0.5 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { soloed: !isSoloed })}
            disabled={!audioReady}
            aria-label={isSoloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
            className={cn(
              "tap-feedback flex h-11 w-11 shrink-0 items-center justify-center rounded-md border font-bold text-meta tracking-wide transition-[color,background-color,border-color,transform,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95] sm:h-10 sm:w-10",
              isSoloed
                ? "border-primary-400/70 bg-primary-500/30 text-primary-100 shadow-[0_0_14px_rgba(255,172,92,0.5)]"
                : "border-border bg-muted text-muted-foreground hover:border-primary-400/40 hover:text-primary-200",
              !audioReady && "cursor-not-allowed opacity-40",
            )}
          >
            S
          </button>
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { muted: !isMuted })}
            disabled={!audioReady}
            aria-label={isMuted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
            className={cn(
              "tap-feedback flex h-11 w-11 shrink-0 items-center justify-center rounded-md border font-bold text-meta tracking-wide transition-[color,background-color,border-color,transform,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95] sm:h-10 sm:w-10",
              isMuted
                ? "border-destructive-400/60 bg-destructive-500/25 text-destructive-100 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                : "border-border bg-muted text-[color:var(--stem-glow)]/85 hover:border-destructive-400/30 hover:text-destructive-200",
              !audioReady && "cursor-not-allowed opacity-40",
            )}
          >
            M
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-0.5 px-0.5">
            <span className="sr-only">{stem.label} gain in decibels</span>
            <input
              type="range"
              min={-20}
              max={6}
              step={0.5}
              value={mixer.gain}
              disabled={!audioReady}
              aria-valuetext={`${mixer.gain > 0 ? "+" : ""}${mixer.gain.toFixed(1)} dB`}
              onChange={(event) =>
                onStemStateChange(stem.id, { mixer: { ...mixer, gain: Number(event.target.value) } })
              }
              className={cn(
                "stem-accent-slider h-1 w-14 min-w-[2.5rem] flex-1",
                audioReady ? "cursor-pointer" : "cursor-not-allowed opacity-40",
              )}
            />
            <span
              className="w-8 shrink-0 text-center font-mono text-meta leading-none text-secondary-foreground"
              aria-hidden
            >
              {mixer.gain > 0 ? "+" : ""}
              {mixer.gain.toFixed(1)}
            </span>
          </label>
        </div>
      </div>
      <div
        ref={laneRef}
        role="button"
        tabIndex={0}
        aria-label={`${stem.label} waveform — click to select`}
        className={cn(
          "waveform-lane-surface relative w-full select-none overflow-hidden rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          audioReady ? "cursor-crosshair" : "cursor-default",
          isActive ? "border-border" : "border-border",
        )}
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate(stem.id);
          }
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest(NO_SEEK_SELECTOR)) {
            return;
          }
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          onActivate(stem.id);
        }}
      >
      <canvas
        ref={waveformCanvasRef}
        className="absolute inset-0 h-full w-full px-0.5"
        aria-hidden="true"
      />
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full px-0.5"
        aria-hidden="true"
      />

      {/* Loading shimmer overlay */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-muted" />
      )}

      <div className="waveform-lane-trim-window pointer-events-none absolute inset-y-0" />
      <div
        className="waveform-lane-handle waveform-lane-handle-start absolute inset-y-0"
        data-state={activeHandle === "start" ? "active" : hoveredHandle === "start" ? "hover" : "idle"}
        onPointerEnter={() => audioReady && setHoveredHandle("start")}
        onPointerLeave={() => setHoveredHandle((h) => (h === "start" ? null : h))}
      >
        <span className="waveform-lane-handle-grip" aria-hidden />
      </div>
      <div
        className="waveform-lane-handle waveform-lane-handle-end absolute inset-y-0"
        data-state={activeHandle === "end" ? "active" : hoveredHandle === "end" ? "hover" : "idle"}
        onPointerEnter={() => audioReady && setHoveredHandle("end")}
        onPointerLeave={() => setHoveredHandle((h) => (h === "end" ? null : h))}
      >
        <span className="waveform-lane-handle-grip" aria-hidden />
      </div>

      {/* Live timecode bubble shown while a trim handle is being dragged */}
      {activeHandle && duration > 0 && (
        <div
          className="waveform-lane-trim-tooltip pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-meta font-semibold tabular-nums"
          style={{
            left: `${clamp(activeHandle === "start" ? trimStartVisible : trimEndVisible, 4, 96)}%`,
          }}
          aria-hidden
        >
          {formatTimecode(duration * ((activeHandle === "start" ? trim.start : trim.end) / 100))}
        </div>
      )}

      {/* Fade-in gradient overlay */}
      {fadeIn > 0 && duration > 0 && (() => {
        // Compute fade-in width as percentage of the visible trim region
        const trimDuration = duration * ((trim.end - trim.start) / 100);
        const fadeInPct = trimDuration > 0 ? Math.min((fadeIn / trimDuration) * 100, 50) : 0;
        // Position within the trim window (relative to visible area)
        const trimStartVis = clamp((trim.start / 100 - visibleStart) / visibleRange, 0, 1) * 100;
        const trimEndVis = clamp((trim.end / 100 - visibleStart) / visibleRange, 0, 1) * 100;
        const trimWidthVis = trimEndVis - trimStartVis;
        const fadeWidthVis = (fadeInPct / 100) * trimWidthVis;
        if (fadeWidthVis < 0.5) return null;
        return (
          <div
            className="pointer-events-none absolute inset-y-0 z-[2]"
            style={{
              left: `${trimStartVis}%`,
              width: `${fadeWidthVis}%`,
              background: `linear-gradient(to right, rgba(0,0,0,0.6), transparent)`,
            }}
            aria-hidden
          />
        );
      })()}

      {/* Fade-out gradient overlay */}
      {fadeOut > 0 && duration > 0 && (() => {
        const trimDuration = duration * ((trim.end - trim.start) / 100);
        const fadeOutPct = trimDuration > 0 ? Math.min((fadeOut / trimDuration) * 100, 50) : 0;
        const trimStartVis = clamp((trim.start / 100 - visibleStart) / visibleRange, 0, 1) * 100;
        const trimEndVis = clamp((trim.end / 100 - visibleStart) / visibleRange, 0, 1) * 100;
        const trimWidthVis = trimEndVis - trimStartVis;
        const fadeWidthVis = (fadeOutPct / 100) * trimWidthVis;
        if (fadeWidthVis < 0.5) return null;
        return (
          <div
            className="pointer-events-none absolute inset-y-0 z-[2]"
            style={{
              right: `${100 - trimEndVis}%`,
              width: `${fadeWidthVis}%`,
              background: `linear-gradient(to left, rgba(0,0,0,0.6), transparent)`,
            }}
            aria-hidden
          />
        );
      })()}

      <span className="waveform-lane-label pointer-events-none absolute left-2 top-1 text-meta font-bold uppercase tracking-wider">
        {stem.label}
      </span>

      </div>
    </div>
  );
}
