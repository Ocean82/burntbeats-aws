import { useEffect } from "react";
import { applyPageMeta } from "./applyPageMeta";
import { resolvePageMeta } from "./siteMeta";

/**
 * Keeps document title, description, canonical, and OG tags aligned with the active route.
 * Static tags in index.html (and per-route SSG HTML) remain the crawler fallback before hydration.
 */
export function useDocumentMeta(pathname: string): void {
  useEffect(() => {
    applyPageMeta(resolvePageMeta(pathname));
  }, [pathname]);
}
