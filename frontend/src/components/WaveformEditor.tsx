import { useCallback, useEffect, useMemo, useRef, type SetStateAction } from "react";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import type { StemDefinition, TrimState } from "../types";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { drawWaveformBars } from "../utils/waveformCanvas";
import {
  installTimelinePerformanceDebugHooks,
  isTimelinePerformanceEnabled,
  recordTimelinePerformanceSample,
} from "../utils/timelinePerformance";
import { stemThemeVariables } from "../utils/stemThemeVariables";

type WaveformEditorProps = {
  stem: StemDefinition;
  trim: TrimState;
  realWaveform?: number[];
  duration?: number;
  isPlaying?: boolean;
  currentPosition?: number;
  isLoading?: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function WaveformEditor({
  stem,
  trim,
  realWaveform,
  duration = 0,
  isPlaying = false,
  currentPosition = 0,
  isLoading = false,
}: WaveformEditorProps) {
  // Guarantee waveform is always a number[]
  const waveform: number[] = realWaveform ?? stem.waveform ?? [];
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  const ZOOM_FACTOR = 1.5;
  const MAX_ZOOM = 8;
  const {
    zoom,
    setZoom: setZoomBase,
    scrollPct,
    setScrollPct: setScrollPctBase,
    visibleStart,
    visibleEnd,
  } = useTimelineViewport(1, MAX_ZOOM, 1);

  const setZoom = useCallback(
    (value: SetStateAction<number>) => {
      const start = performance.now();
      setZoomBase(value);
      recordTimelinePerformanceSample("zoom", performance.now() - start);
    },
    [setZoomBase]
  );

  const setScrollPct = useCallback(
    (value: SetStateAction<number>) => {
      const start = performance.now();
      setScrollPctBase(value);
      recordTimelinePerformanceSample("scroll", performance.now() - start);
    },
    [setScrollPctBase]
  );

  useEffect(() => {
    if (!isTimelinePerformanceEnabled()) return undefined;
    return installTimelinePerformanceDebugHooks();
  }, []);

  // Depend on viewport and waveform only.
  const waveformSlice = useMemo(() => {
    if (waveform.length === 0) return [];
    if (zoom === 1) return waveform;
    const start = Math.max(0, Math.floor(visibleStart * waveform.length));
    const end = Math.min(waveform.length, Math.ceil(visibleEnd * waveform.length));
    return waveform.slice(start, end);
  }, [waveform, zoom, visibleStart, visibleEnd]);

  // Clamp trim so start <= end before computing times
  const startP = Math.min(trim.start, trim.end);
  const endP = Math.max(trim.start, trim.end);
  const startTime = duration * (startP / 100);
  const endTime = duration * (endP / 100);
  const trimmedDuration = endTime - startTime;

  const playheadPercent = duration > 0 ? (currentPosition / duration) * 100 : 0;
  // && not || — only show playhead when actively playing and positioned
  const isPlayheadVisible = isPlaying && currentPosition > 0;

  const zoomIn = () => {
    const nextZoom = Math.min(zoom * ZOOM_FACTOR, MAX_ZOOM);
    setZoom(nextZoom);
  };
  
  const zoomOut = () => {
    const nextZoom = zoom / ZOOM_FACTOR;
    if (nextZoom < 1) {
      setScrollPct(0);
      setZoom(1);
    } else {
      setZoom(nextZoom);
    }
  };

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    drawWaveformBars({
      canvas,
      values: waveformSlice,
      color: stem.glow,
      minimumBarHeightPx: 16,
      alphaEven: 0.9,
      alphaOdd: 0.58,
      gapPx: 2,
      heightScale: 1,
    });
  }, [waveformSlice, stem.glow]);

  return (
    <div
      className="waveform-editor-shell relative overflow-hidden rounded-[1.5rem] border px-4 py-5"
      style={stemThemeVariables(stem)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="stem-header-glow-dot h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="stem-text-accent text-[10px] font-semibold uppercase tracking-wider">
            {stem.label} · Waveform
          </span>
        </div>
        {/* Fix #7: gate on waveform.length > 0, not realWaveform existence */}
        {waveform.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              className="rounded p-1 text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom <= 1}
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-white/50">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={zoomIn}
              className="rounded p-1 text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom >= 8}
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 top-12 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.11),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-x-4 top-[4.5rem] bottom-5 h-px bg-white/8" />
      <div className="pointer-events-none absolute inset-0 top-12 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:10%_100%]" />

      {isLoading ? (
        <div className="relative flex h-28 items-center gap-[2px]">
          {Array.from({ length: 64 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 animate-pulse rounded-full bg-white/20"
              style={{ height: `${20 + Math.random() * 60}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          </div>
        </div>
      ) : waveform.length === 0 ? (
        // Fix #2: handle empty waveform gracefully
        <div className="flex h-28 items-center justify-center text-xs text-white/30">
          No waveform data
        </div>
      ) : (
        // Canvas bars with same viewport behavior as the previous DOM path.
        <div className="relative h-28 overflow-hidden">
          <canvas
            ref={waveformCanvasRef}
            className="h-full w-full"
            aria-hidden="true"
            style={{
              width: `${100 * zoom}%`,
              height: "100%",
              transform: zoom > 1 ? `translateX(-${scrollPct * (1 - 1 / zoom)}%)` : undefined,
            }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-4 top-14 bottom-5">
        <div
          className="waveform-editor-trim-region absolute inset-y-0 rounded-[1.2rem] border border-white/18 bg-white/6"
          style={{
            left: `${startP}%`,
            right: `${100 - endP}%`,
          }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${startP}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${endP}%` }} />
        {isPlayheadVisible && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
            style={{ left: `${playheadPercent}%`, boxShadow: "0 0 8px rgba(255,255,255,0.8)" }}
          />
        )}
      </div>

      {zoom > 1 && (
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={scrollPct}
          onChange={(e) => setScrollPct(Number(e.target.value))}
          className="stem-accent-slider mt-2 w-full"
          aria-label="Scroll waveform"
        />
      )}

      {duration > 0 && (
        <div className="mt-2 flex justify-between text-[10px] text-white/50">
          <span>{formatTime(startTime)}</span>
          <span className="text-white/30">({formatTime(trimmedDuration)})</span>
          <span>{formatTime(endTime)}</span>
        </div>
      )}
    </div>
  );
}
