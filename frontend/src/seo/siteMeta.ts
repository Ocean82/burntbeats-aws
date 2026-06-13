/** Canonical public origin for SEO, OG tags, and sitemap entries. */
export const SITE_ORIGIN = "https://www.burntbeats.com";

export const SITE_NAME = "Burnt Beats";

/** Default metadata for the marketing landing / home page. */
export const SITE_DEFAULT_META = {
  title: "Burnt Beats — AI Stem Splitter, Mixer & MIDI Workstation",
  description:
    "Browser workstation for producers and DJs. Split tracks into vocals, drums, bass, and melody, mix in-browser, reopen past jobs from your library, and convert stems to MIDI — no install required.",
} as const;

export interface PageMeta {
  title: string;
  description: string;
  /** Path only, e.g. `/pricing`. Canonical URL is SITE_ORIGIN + path. */
  path: string;
  /** When false, adds `<meta name="robots" content="noindex">` for app-only views. */
  indexable?: boolean;
}

const PRICING_META: PageMeta = {
  title: "Pricing — Burnt Beats",
  description:
    "Burnt Beats plans and one-time stem packs. Subscribe for regular workflow or buy tokens when you need occasional splits, mixing, and MIDI conversion in the browser.",
  path: "/pricing",
};

const LEGAL_PRIVACY_META: PageMeta = {
  title: "Privacy Policy — Burnt Beats",
  description:
    "How Burnt Beats collects, uses, and protects your data — including authentication, billing, analytics cookies, and audio processing.",
  path: "/privacy-policy",
};

const LEGAL_TERMS_META: PageMeta = {
  title: "Terms of Service — Burnt Beats",
  description:
    "Terms governing use of the Burnt Beats browser music workstation, subscriptions, one-time packs, and stem processing services.",
  path: "/terms-of-service",
};

/** Route-level metadata for public, indexable pages. */
export const PUBLIC_ROUTE_META: Record<string, PageMeta> = {
  "/": {
    ...SITE_DEFAULT_META,
    path: "/",
  },
  "/pricing": PRICING_META,
  "/privacy-policy": LEGAL_PRIVACY_META,
  "/terms-of-service": LEGAL_TERMS_META,
};

/** App workflow paths shown to signed-out visitors as the landing page (not separately indexed). */
const SIGNED_OUT_APP_PATHS = new Set([
  "/speech",
  "/midi",
  "/my-stems",
  "/library",
  "/tuner",
]);

export function resolvePageMeta(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, "") || "/";
  const explicit = PUBLIC_ROUTE_META[path];
  if (explicit) return explicit;

  if (SIGNED_OUT_APP_PATHS.has(path)) {
    return { ...SITE_DEFAULT_META, path, indexable: false };
  }

  return {
    title: `Page Not Found — Burnt Beats`,
    description:
      "The page you requested is not available. Return to Burnt Beats to split tracks, mix stems, and convert audio to MIDI in your browser.",
    path,
    indexable: false,
  };
}

export function canonicalUrl(path: string): string {
  const normalized = path.replace(/\/+$/, "") || "/";
  if (normalized === "/") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${normalized}`;
}
