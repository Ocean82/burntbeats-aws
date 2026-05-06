/**
 * Cross-platform download helper that handles iOS Safari quirks.
 *
 * iOS Safari has inconsistent behavior with programmatic `<a download>` clicks:
 * - Blob URLs may open in a new tab instead of downloading.
 * - Large files may fail silently.
 * - Web Share API (when available) provides a better UX on mobile.
 *
 * This utility detects the platform and uses the best available strategy.
 */

/** Detect if running on iOS (iPhone/iPad/iPod). */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Detect if running on a touch-primary device (mobile/tablet). */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Detect if Web Share API supports file sharing. */
async function canShareFile(file: File): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Download a blob to the user's device using the best available method.
 *
 * Strategy priority:
 * 1. Web Share API (iOS Safari, Android) — lets user choose save location
 * 2. Standard <a download> click (desktop browsers, Android Chrome)
 * 3. window.open fallback (last resort for iOS Safari when share unavailable)
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  // Try Web Share API first on mobile (best UX on iOS)
  if (isTouchDevice() && isIOS()) {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    const shareable = await canShareFile(file);
    if (shareable) {
      try {
        await navigator.share({ files: [file] });
        return; // User completed the share/save action
      } catch (err) {
        // User cancelled share sheet — fall through to standard download
        if (err instanceof Error && err.name === "AbortError") {
          return; // User intentionally cancelled, don't retry
        }
        // Other error — fall through to standard download
      }
    }
  }

  // Standard download via <a download> — works on most browsers
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Clean up after a short delay (some browsers need the element to persist briefly)
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

/**
 * Check if the device is likely to struggle with large client-side exports.
 * Returns true if we should recommend MP3 over WAV or prefer server export.
 */
export function shouldRecommendCompressedExport(): boolean {
  if (!isTouchDevice()) return false;

  // Check device memory if available (Chrome/Edge)
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory && nav.deviceMemory <= 4) return true;

  // On any mobile device, recommend compressed for safety
  return true;
}
