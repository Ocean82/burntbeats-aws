import { useMediaQuery } from "./useMediaQuery";

/**
 * Returns true when the user prefers reduced motion (OS-level setting).
 * Uses useMediaQuery internally to track `prefers-reduced-motion: reduce`.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
