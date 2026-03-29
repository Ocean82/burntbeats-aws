/**
 * Creates a requestAnimationFrame-based playhead tracker.
 * Returns start/stop functions. The tracker computes elapsed time
 * from a start time and calls onUpdate with the progress (0–100).
 */
export function createPlayheadTracker(params: {
  context: AudioContext;
  duration: number;
  startTime: number;
  onUpdate: (progressPct: number) => void;
  isActive: () => boolean;
}): { start: () => number; stop: () => void } {
  let rafId: number | null = null;

  const tick = () => {
    if (params.duration <= 0) return;
    const elapsed = params.context.currentTime - params.startTime;
    const progress = Math.min(100, (elapsed / params.duration) * 100);
    params.onUpdate(progress);
    if (progress < 100 && params.isActive()) {
      rafId = requestAnimationFrame(tick);
    }
  };

  return {
    start: () => {
      rafId = requestAnimationFrame(tick);
      return rafId;
    },
    stop: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
