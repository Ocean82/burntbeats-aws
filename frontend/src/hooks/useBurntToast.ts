/**
 * useBurntToast — convenience hook that fires branded quip toasts.
 * Wraps the existing toast system with Burnt Beats personality.
 *
 * Usage:
 *   const { burntToast } = useBurntToast();
 *   burntToast("splitSuccess");            // random success quip
 *   burntToast("splitError");              // random error quip
 *   burntToast("exportSuccess");           // random export quip
 *   burntToast("success", { duration: 6000 }); // custom duration
 */
import { useCallback } from "react";
import { useToast } from "../store/toastStore";
import { getBurntToast } from "../utils/burntQuips";

interface BurntToastOptions {
  /** Override auto-detected toast type. */
  type?: "success" | "error" | "info" | "undo";
  /** Duration in ms (default: 4000). */
  duration?: number;
}

export function useBurntToast() {
  const { toast, dismiss } = useToast();

  const burntToast = useCallback(
    (category: string, options?: BurntToastOptions) => {
      const { message, type: autoType } = getBurntToast(category);
      return toast(message, {
        type: options?.type ?? autoType,
        duration: options?.duration ?? 4000,
      });
    },
    [toast],
  );

  return { burntToast, dismiss };
}
