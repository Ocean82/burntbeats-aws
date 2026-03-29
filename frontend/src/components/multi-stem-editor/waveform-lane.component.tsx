import { useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { Headphones, Volume2, VolumeX } from "lucide-react";
import type { MixerState, StemDefinition, TrimState } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";
import { drawWaveformBars } from "../../utils/waveformCanvas";
import { stemThemeVariables, trimVisiblePercentsStyle } from "../../utils/stemThemeVariables";

const BAR_BUDGET = 300;
const HANDLE_HIT_PX = 12;
const MIN_TRIM_GAP_PCT = 2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
  zoom: number;
  scrollPct: number;
  /** 0–1 fraction of the visible lane width considered "played". */
  playheadFraction?: number;
  /** Live analyser time-domain data for waveform modulation during playback. */
  getAnalyserData?: () => Uint8Array | null;
  onTrimChange: (stemId: string, trim: TrimState) => void;
  onSeek: (pct: number) => void;
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
  zoom,
  scrollPct,
  playheadFraction,
  getAnalyserData,
  onTrimChange,
  onSeek,
  onActivate,
  onStemStateChange,
}: WaveformLaneProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<"start" | "end" | "seek" | null>(null);
  const didDragRef = useRef(false);
  const trimRef = useRef(trim);
  const stemIdRef = useRef(stem.id);
  const onTrimChangeRef = useRef(onTrimChange);
  const onSeekRef = useRef(onSeek);
  const visibleStartRef = useRef(0);
  const visibleRangeRef = useRef(1);

  trimRef.current = trim;
  stemIdRef.current = stem.id;
  onTrimChangeRef.current = onTrimChange;
  onSeekRef.current = onSeek;

  const visibleStart = scrollPct / 100;
  const visibleEnd = Math.min(1, visibleStart + 1 / zoom);
  const visibleRange = Math.max(visibleEnd - visibleStart, 1e-6);
  visibleStartRef.current = visibleStart;
  visibleRangeRef.current = visibleRange;

  const hitTestHandle = useCallback((event: ReactMouseEvent): "start" | "end" | "seek" => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return "seek";
    const toPixel = (pct: number) => {
      const fraction = clamp((pct / 100 - visibleStart) / visibleRange, 0, 1);
      return fraction * rect.width;
    };
    const mouseX = event.clientX - rect.left;
    const distanceStart = Math.abs(mouseX - toPixel(trim.start));
    const distanceEnd = Math.abs(mouseX - toPixel(trim.end));
    if (distanceStart <= HANDLE_HIT_PX) return "start";
    if (distanceEnd <= HANDLE_HIT_PX) return "end";
    return "seek";
  }, [trim.start, trim.end, visibleStart, visibleRange]);

  const onMouseDown = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const mode = hitTestHandle(event);
    draggingRef.current = mode;

    if (mode === "seek") {
      didDragRef.current = true;
      const rect = laneRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        const raw = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const pct = clamp(visibleStart + raw * visibleRange, 0, 1) * 100;
        onSeekRef.current(pct);
      }
    }
  }, [hitTestHandle, visibleStart, visibleRange]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
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
        onSeekRef.current(pct);
      }
    };
    const onUp = () => {
      draggingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const { slice, startBin } = useMemo(() => {
    const start = clamp(Math.floor(visibleStart * waveform.length), 0, waveform.length);
    const end = clamp(Math.ceil(visibleEnd * waveform.length), start, waveform.length);
    return { slice: downsample(waveform.slice(start, end), BAR_BUDGET), startBin: start };
  }, [waveform, visibleStart, visibleEnd]);

  const toVisible = (pct: number) => clamp((pct / 100 - visibleStart) / visibleRange, 0, 1) * 100;
  const trimStartVisible = toVisible(trim.start);
  const trimEndVisible = toVisible(trim.end);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const alpha = isMuted ? 0.3 : isActive ? 0.9 : 0.5;

    // If we have a live analyser, run an rAF loop for modulation
    if (getAnalyserData) {
      let rafId: number;
      const draw = () => {
        const analyserData = getAnalyserData() ?? undefined;
        drawWaveformBars({
          canvas,
          values: slice,
          color: stem.glow,
          minimumBarHeightPx: 8,
          alphaEven: alpha,
          alphaOdd: alpha,
          gapPx: 1,
          heightScale: 0.9,
          playedFraction: playheadFraction,
          analyserData,
        });
        rafId = requestAnimationFrame(draw);
      };
      rafId = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(rafId);
    }

    // Static draw (no playback)
    drawWaveformBars({
      canvas,
      values: slice,
      color: stem.glow,
      minimumBarHeightPx: 8,
      alphaEven: alpha,
      alphaOdd: alpha,
      gapPx: 1,
      heightScale: 0.9,
      playedFraction: playheadFraction,
    });
  }, [slice, isMuted, isActive, stem.glow, playheadFraction, getAnalyserData]);

  return (
    <div
      ref={laneRef}
      className={cn(
        "waveform-lane-surface relative w-full select-none overflow-hidden rounded-lg border transition-all cursor-crosshair",
        isActive ? "border-white/20" : "border-white/8",
        isMuted && "opacity-40"
      )}
      style={{
        ...stemThemeVariables(stem),
        ...trimVisiblePercentsStyle(trimStartVisible, trimEndVisible),
      }}
      onMouseDown={onMouseDown}
      onClick={() => {
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
        data-start-bin={startBin}
      />

      {/* Loading shimmer overlay */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-white/10" />
      )}

      <div className="waveform-lane-trim-window pointer-events-none absolute inset-y-0" />
      <div className="waveform-lane-handle-start absolute inset-y-0" />
      <div className="waveform-lane-handle-end absolute inset-y-0" />
      <span className="waveform-lane-label pointer-events-none absolute left-2 top-1 text-[9px] font-bold uppercase tracking-wider">
        {stem.label}
      </span>

      <div
        className="pointer-events-auto absolute right-1 top-0.5 z-10 flex max-w-[min(100%,11rem)] items-center gap-0.5 rounded-md border border-white/10 bg-black/55 px-0.5 py-0.5 backdrop-blur-sm"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="toolbar"
        aria-label={`${stem.label} quick mixer`}
      >
        <button
          type="button"
          onClick={() => onStemStateChange(stem.id, { soloed: !isSoloed })}
          aria-label={isSoloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] transition",
            isSoloed
              ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
              : "border-white/10 bg-white/5 text-white/70 hover:text-white"
          )}
        >
          <Headphones className="h-3 w-3" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onStemStateChange(stem.id, { muted: !isMuted })}
          aria-label={isMuted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] transition",
            isMuted
              ? "border-red-400/50 bg-red-500/25 text-red-100"
              : "border-white/10 bg-white/5 text-white/70 hover:text-white"
          )}
        >
          {isMuted ? <VolumeX className="h-3 w-3" aria-hidden /> : <Volume2 className="h-3 w-3" aria-hidden />}
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-0.5 px-0.5">
          <span className="sr-only">{stem.label} gain in decibels</span>
          <input
            type="range"
            min={-24}
            max={12}
            step={0.5}
            value={mixer.gain}
            aria-valuetext={`${mixer.gain > 0 ? "+" : ""}${mixer.gain.toFixed(1)} dB`}
            onChange={(event) =>
              onStemStateChange(stem.id, { mixer: { ...mixer, gain: Number(event.target.value) } })
            }
            className="stem-accent-slider h-1 w-14 min-w-[2.5rem] flex-1 cursor-pointer"
          />
          <span
            className="w-7 shrink-0 text-center font-mono text-[8px] leading-none text-white/70"
            aria-hidden
          >
            {mixer.gain > 0 ? "+" : ""}
            {mixer.gain.toFixed(1)}
          </span>
        </label>
      </div>
    </div>
  );
}
