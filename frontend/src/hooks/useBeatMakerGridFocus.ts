import { useCallback, useState } from "react";
import type { PatternLength } from "../audio/types";

export interface GridFocus {
  row: number;
  step: number;
}

export interface UseBeatMakerGridFocusReturn {
  focus: GridFocus;
  setFocus: (focus: GridFocus) => void;
  moveFocus: (deltaRow: number, deltaStep: number, rowCount: number, steps: PatternLength) => void;
}

export function useBeatMakerGridFocus(
  initial: GridFocus = { row: 0, step: 0 },
): UseBeatMakerGridFocusReturn {
  const [focus, setFocusState] = useState<GridFocus>(initial);

  const setFocus = useCallback((next: GridFocus) => {
    setFocusState(next);
  }, []);

  const moveFocus = useCallback(
    (deltaRow: number, deltaStep: number, rowCount: number, steps: PatternLength) => {
      setFocusState((prev) => ({
        row: Math.max(0, Math.min(rowCount - 1, prev.row + deltaRow)),
        step: Math.max(0, Math.min(steps - 1, prev.step + deltaStep)),
      }));
    },
    [],
  );

  return { focus, setFocus, moveFocus };
}
