import { useCallback, useEffect, useRef } from "react";

export interface UseRotaryKnobOptions {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  dragSensitivity?: number;
}

export function useRotaryKnob({
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
  dragSensitivity = 200,
}: UseRotaryKnobOptions) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);
  const snap = useCallback((v: number) => Math.round(v / step) * step, [step]);

  const normalize = useCallback((v: number) => (v - min) / (max - min), [min, max]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startY.current = e.clientY;
      startVal.current = value;
    },
    [disabled, value],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = e.shiftKey ? 4 : 1;
      const delta = ((dy / dragSensitivity) * range) / sensitivity;
      onChange(clamp(snap(startVal.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, onChange, clamp, snap, dragSensitivity]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      const mult = e.shiftKey ? 0.25 : 1;
      onChange(clamp(snap(value + dir * step * mult)));
    },
    [disabled, value, step, onChange, clamp, snap],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      e.stopPropagation();
      const mult = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onChange(clamp(snap(value + step * mult)));
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(clamp(snap(value - step * mult)));
      }
    },
    [disabled, value, step, onChange, clamp, snap],
  );

  return {
    normalize,
    handleMouseDown,
    handleWheel,
    handleKeyDown,
    clamp,
    snap,
  };
}
