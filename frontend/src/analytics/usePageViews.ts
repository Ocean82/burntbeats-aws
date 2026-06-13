import { useEffect, useRef } from "react";
import { resolvePageMeta } from "../seo/siteMeta";
import { getGaMeasurementId, trackPageView } from "./pageViews";

/**
 * Sends GA4 page_view events on SPA route changes (after consent + gtag init).
 */
export function usePageViews(pathname: string): void {
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (!getGaMeasurementId()) return;

    // Initial load is tracked by gtag("config") in initGoogleTag.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const meta = resolvePageMeta(pathname);
    trackPageView(meta.path, meta.title);
  }, [pathname]);
}
