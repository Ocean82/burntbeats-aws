/**
 * Haptic feedback utility for mobile devices.
 * Uses the Vibration API (Android) — gracefully no-ops on iOS and desktop.
 * Respects prefers-reduced-motion.
 */

type HapticPattern = "light" | "medium" | "success" | "error" | "warning";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  success: [15, 50, 15],
  error: [30, 80, 30, 80, 30],
  warning: [20, 60, 20],
};

/** Check if haptic feedback is available and appropriate. */
function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!("vibrate" in navigator)) return false;
  // Respect reduced motion preference
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

/**
 * Trigger haptic feedback on supported devices.
 * No-ops silently on unsupported platforms (iOS Safari, desktop).
 */
export function triggerHaptic(pattern: HapticPattern = "light"): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Silently ignore — some browsers throw on vibrate in certain contexts
  }
}
