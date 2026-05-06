import { useCallback, useEffect, useRef } from "react";

interface UsePinchZoomOptions {
  /** Current zoom level. */
  zoom: number;
  /** Set zoom level (clamped externally). */
  setZoom: (updater: (prev: number) => number) => void;
  /** Current scroll percentage (0–100). */
  scrollPct: number;
  /** Set scroll percentage. */
  setScrollPct: (updater: (prev: number) => number) => void;
  /** Minimum zoom level (default 1). */
  minZoom?: number;
  /** Maximum zoom level (default 8). */
  maxZoom?: number;
  /** Whether the hook is enabled (default true). */
  enabled?: boolean;
}

/**
 * Adds pinch-to-zoom and two-finger pan gestures to a container element.
 * Designed for the waveform timeline on touch devices.
 *
 * - Two-finger pinch: adjusts zoom level
 * - Two-finger horizontal pan: adjusts scroll position
 *
 * Returns a ref to attach to the container element.
 */
export function usePinchZoom({
  zoom,
  setZoom,
  scrollPct,
  setScrollPct,
  minZoom = 1,
  maxZoom = 8,
  enabled = true,
}: UsePinchZoomOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialScrollPct: number;
    initialMidX: number;
    active: boolean;
  } | null>(null);

  // Keep current values in refs for use in event handlers
  const zoomRef = useRef(zoom);
  const scrollPctRef = useRef(scrollPct);
  zoomRef.current = zoom;
  scrollPctRef.current = scrollPct;

  const getDistance = useCallback((t1: Touch, t2: Touch): number => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getMidX = useCallback((t1: Touch, t2: Touch): number => {
    return (t1.clientX + t2.clientX) / 2;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      // Prevent browser zoom
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      gestureStateRef.current = {
        initialDistance: getDistance(t1, t2),
        initialZoom: zoomRef.current,
        initialScrollPct: scrollPctRef.current,
        initialMidX: getMidX(t1, t2),
        active: true,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !gestureStateRef.current?.active) return;
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const state = gestureStateRef.current;

      // Pinch zoom
      const currentDistance = getDistance(t1, t2);
      const scale = currentDistance / state.initialDistance;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, state.initialZoom * scale));
      setZoom(() => newZoom);

      // Two-finger horizontal pan
      const currentMidX = getMidX(t1, t2);
      const deltaX = currentMidX - state.initialMidX;
      const containerWidth = el.getBoundingClientRect().width;
      if (containerWidth > 0) {
        // Convert pixel delta to scroll percentage
        const pctDelta = (deltaX / containerWidth) * (100 / newZoom) * -1;
        const newScrollPct = Math.max(0, Math.min(100, state.initialScrollPct + pctDelta));
        setScrollPct(() => newScrollPct);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && gestureStateRef.current?.active) {
        gestureStateRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, minZoom, maxZoom, setZoom, setScrollPct, getDistance, getMidX]);

  return containerRef;
}
