import { useEffect } from "react";
import type { AppView } from "../hooks/workflow/useEditorViewRouting";

type ImportFn = () => Promise<unknown>;

const viewImports: Record<AppView, ImportFn> = {
  editor: () => import("../app/editor-main-view.component"),
  pricing: () => import("../components/PricingPage"),
  "my-stems": () => import("../components/MyStemsPage"),
  speech: () => import("../pages/SpeechCleanPage"),
  midi: () => import("../pages/MidiConvertPage"),
  beats: () => import("../pages/LibraryPage"),
  tuner: () => import("../pages/TunerPage"),
};

export function preloadView(view: AppView) {
  viewImports[view]();
}

const ADJACENCY_MAP: Record<AppView, AppView[]> = {
  editor: ["pricing", "speech", "midi"],
  pricing: ["my-stems", "editor"],
  "my-stems": ["pricing", "editor"],
  speech: ["midi", "editor"],
  midi: ["speech", "beats", "editor"],
  beats: ["midi", "tuner", "editor"],
  tuner: ["beats", "editor"],
};

export function getViewsToPreload(currentView: AppView): AppView[] {
  return ADJACENCY_MAP[currentView] ?? [];
}

/**
 * Estimate whether the network is fast enough to justify preloading.
 * Returns true for non-saveData connections that aren't 2G / slow-2G.
 */
function canPreloadChunks(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return (
    connection.effectiveType !== "2g" && connection.effectiveType !== "slow-2g"
  );
}

const PRELOAD_DELAY_MS = 1500;

export function useViewPreloading(currentView: AppView) {
  useEffect(() => {
    if (!canPreloadChunks()) return;
    const adjacent = getViewsToPreload(currentView);
    if (adjacent.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const view of adjacent) {
        preloadView(view);
      }
    }, PRELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentView]);
}
