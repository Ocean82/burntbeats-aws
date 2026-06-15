import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { listIndexablePublicRoutes, patchIndexHtml } from "./src/seo/patchIndexHtml";
import { resolvePageMeta } from "./src/seo/siteMeta";

/**
 * Injects crawlable static HTML into #root and emits per-route index.html files
 * for public marketing/legal pages (SSG) so Googlebot gets content in wave one.
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

      for (const meta of listIndexablePublicRoutes()) {
        if (meta.path === "/") continue;

        const routeHtml = patchIndexHtml(rootHtml, meta);
        const routeDir = join(outDir, meta.path.slice(1));
        const routeIndexPath = join(routeDir, "index.html");
        mkdirSync(dirname(routeIndexPath), { recursive: true });
        writeFileSync(routeIndexPath, routeHtml, "utf-8");
      }
    },
  };
}
