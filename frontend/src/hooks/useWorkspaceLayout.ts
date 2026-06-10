import { useCallback, useEffect, useState } from "react";
import type { WorkspaceLayoutState } from "@/types/workspace";

/**
 * Manages workspace layout state:
 * - mixerExpanded: whether the mixer console is expanded (default true).
 * - viewportSize: current window dimensions, updated on resize.
 */
export function useWorkspaceLayout(): WorkspaceLayoutState {
  const [mixerExpanded, setMixerExpanded] = useState(true);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  }));

  const toggleMixer = useCallback(() => {
    setMixerExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { mixerExpanded, toggleMixer, viewportSize };
}
