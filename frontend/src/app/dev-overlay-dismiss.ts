import { useCallback, useSyncExternalStore } from "react";

export const DEV_OVERLAYS_DISMISSED_KEY = "bb:dev-overlays-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DEV_OVERLAYS_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("bb:dev-overlays-dismissed", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("bb:dev-overlays-dismissed", onStoreChange);
  };
}

export function dismissDevOverlays(): void {
  try {
    sessionStorage.setItem(DEV_OVERLAYS_DISMISSED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event("bb:dev-overlays-dismissed"));
}

export function restoreDevOverlays(): void {
  try {
    sessionStorage.removeItem(DEV_OVERLAYS_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("bb:dev-overlays-dismissed"));
}

export function useDevOverlayDismissed() {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);

  const dismiss = useCallback(() => {
    dismissDevOverlays();
  }, []);

  const restore = useCallback(() => {
    restoreDevOverlays();
  }, []);

  return { dismissed, dismiss, restore };
}
