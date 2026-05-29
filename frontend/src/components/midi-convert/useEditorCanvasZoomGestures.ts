/**
 * Pinch-to-zoom (touch) and ctrl+wheel zoom on the editor piano-roll scroller.
 */
import { useEffect, useRef, type RefObject } from "react";
import { clampEditorZoom } from "./pianoRollTheme";

function touchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function useEditorCanvasZoomGestures(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoomLevel: number,
  onZoomLevelChange: ((level: number) => void) | undefined,
) {
  const zoomRef = useRef(zoomLevel);

  useEffect(() => {
    zoomRef.current = zoomLevel;
    const el = scrollRef.current;
    if (!el || !onZoomLevelChange) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      onZoomLevelChange(clampEditorZoom(zoomRef.current * factor));
    };

    let pinchAnchor: { distance: number; zoom: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchAnchor = {
        distance: touchDistance(e.touches),
        zoom: zoomRef.current,
      };
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchAnchor || e.touches.length !== 2) return;
      e.preventDefault();
      const scale = touchDistance(e.touches) / pinchAnchor.distance;
      onZoomLevelChange(clampEditorZoom(pinchAnchor.zoom * scale));
    };

    const endPinch = () => {
      pinchAnchor = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    el.addEventListener("touchcancel", endPinch);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
      el.removeEventListener("touchcancel", endPinch);
    };
  }, [scrollRef, zoomLevel, onZoomLevelChange]);
}
