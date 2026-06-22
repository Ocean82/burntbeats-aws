import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { listIndexablePublicRoutes, listNonIndexableRoutes, patchIndexHtml } from "./src/seo/patchIndexHtml";
import { canonicalUrl, resolvePageMeta, SITE_ORIGIN } from "./src/seo/siteMeta";

/** Generates an sitemap.xml entry for a page route. */
function sitemapEntry(path: string, priority: string, changefreq: string): string {
  return `
  <url>
    <loc>${canonicalUrl(path)}</loc>
    <lastmod>${todayDate()}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`.trim();
}

function todayDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Priority/change frequency for each public route. */
const SITEMAP_CONFIG: Record<string, { priority: string; changefreq: string }> = {
  "/":                { priority: "1.0", changefreq: "weekly" },
  "/pricing":         { priority: "0.8", changefreq: "weekly" },
  "/privacy-policy":  { priority: "0.5", changefreq: "yearly" },
  "/terms-of-service":{ priority: "0.5", changefreq: "yearly" },
};

/**
 * Injects crawlable static HTML into #root and emits per-route index.html files
 * for public marketing/legal pages (SSG) so Googlebot gets content in wave one.
 * Also emits noindex static HTML for signed-out app routes and a fresh sitemap.xml.
 */
export function burntBeatsSeoPlugin(): Plugin {
  let outDir = "dist";

  return {
    name: "burntbeats-seo",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return patchIndexHtml(html, resolvePageMeta("/"));
    },
    writeBundle() {
      const rootIndexPath = join(outDir, "index.html");
      const rootHtml = readFileSync(rootIndexPath, "utf-8");

      // Per-route static HTML for indexable public pages
      for (const meta of listIndexablePublicRoutes()) {
        if (meta.path === "/") continue;

        const routeHtml = patchIndexHtml(rootHtml, meta);
        const routeDir = join(outDir, meta.path.slice(1));
        const routeIndexPath = join(routeDir, "index.html");
        mkdirSync(dirname(routeIndexPath), { recursive: true });
        writeFileSync(routeIndexPath, routeHtml, "utf-8");
      }

      // Per-route noindex static HTML for signed-out app paths
      for (const meta of listNonIndexableRoutes()) {
        const routeHtml = patchIndexHtml(rootHtml, meta);
        const routeDir = join(outDir, meta.path.slice(1));
        const routeIndexPath = join(routeDir, "index.html");
        mkdirSync(dirname(routeIndexPath), { recursive: true });
        writeFileSync(routeIndexPath, routeHtml, "utf-8");
      }

      // Dynamically generated sitemap.xml
      const entries = Object.entries(SITEMAP_CONFIG).map(([path, cfg]) =>
        sitemapEntry(path, cfg.priority, cfg.changefreq)
      ).join("\n    ");
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n    ${entries}\n</urlset>\n`;
      writeFileSync(join(outDir, "sitemap.xml"), sitemap, "utf-8");
    },
  };
}
