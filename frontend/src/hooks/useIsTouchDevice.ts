import { useSyncExternalStore } from "react";

/**
 * Detect if the primary input is a coarse pointer (touch device).
 * Uses matchMedia for reactive updates (e.g., if a user connects a mouse to a tablet).
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns true if the primary pointing device is coarse (finger/stylus).
 * Reactive — updates if the user connects/disconnects input devices.
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
