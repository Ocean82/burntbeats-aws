import { useEffect } from "react";
import { canonicalUrl, resolvePageMeta, type PageMeta } from "./siteMeta";

const META_DESCRIPTION_SELECTOR = 'meta[name="description"]';
const META_ROBOTS_SELECTOR = 'meta[name="robots"]';
const OG_TITLE_SELECTOR = 'meta[property="og:title"]';
const OG_DESCRIPTION_SELECTOR = 'meta[property="og:description"]';
const OG_URL_SELECTOR = 'meta[property="og:url"]';
const TWITTER_TITLE_SELECTOR = 'meta[name="twitter:title"]';
const TWITTER_DESCRIPTION_SELECTOR = 'meta[name="twitter:description"]';
const CANONICAL_SELECTOR = 'link[rel="canonical"]';

function upsertMeta(selector: string, attributes: Record<string, string>): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    const [, attrName, attrValue] = selector.match(/\[(.+?)="(.+?)"\]/) ?? [];
    if (attrName && attrValue) element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>(CANONICAL_SELECTOR);
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function applyPageMeta(meta: PageMeta): void {
  document.title = meta.title;

  upsertMeta(META_DESCRIPTION_SELECTOR, {
    name: "description",
    content: meta.description,
  });

  if (meta.indexable === false) {
    upsertMeta(META_ROBOTS_SELECTOR, { name: "robots", content: "noindex, nofollow" });
  } else {
    document.head.querySelector(META_ROBOTS_SELECTOR)?.remove();
  }

  const url = canonicalUrl(meta.path);
  upsertMeta(OG_TITLE_SELECTOR, { property: "og:title", content: meta.title });
  upsertMeta(OG_DESCRIPTION_SELECTOR, {
    property: "og:description",
    content: meta.description,
  });
  upsertMeta(OG_URL_SELECTOR, { property: "og:url", content: url });
  upsertMeta(TWITTER_TITLE_SELECTOR, { name: "twitter:title", content: meta.title });
  upsertMeta(TWITTER_DESCRIPTION_SELECTOR, {
    name: "twitter:description",
    content: meta.description,
  });
  upsertCanonical(url);
}

/**
 * Keeps document title, description, canonical, and OG tags aligned with the active route.
 * Static tags in index.html remain the crawler fallback before hydration.
 */
export function useDocumentMeta(pathname: string): void {
  useEffect(() => {
    applyPageMeta(resolvePageMeta(pathname));
  }, [pathname]);
}
