import { canonicalUrl, PUBLIC_ROUTE_META, SIGNED_OUT_APP_ROUTES, type PageMeta } from "./siteMeta";
import { staticSeoMainHtml } from "./staticSeoContent";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTagContent(html: string, pattern: RegExp, replacement: string): string {
  return html.replace(pattern, replacement);
}

/** Patches built index.html head tags and #root static SEO body for a public route. */
export function patchIndexHtml(html: string, meta: PageMeta): string {
  const url = canonicalUrl(meta.path);
  const robotsTag =
    meta.indexable === false
      ? '<meta name="robots" content="noindex, nofollow" />'
      : "";

  let patched = html;
  patched = replaceTagContent(patched, /<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  patched = replaceTagContent(
    patched,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  );
  patched = replaceTagContent(
    patched,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );

  if (robotsTag) {
    if (!patched.includes('name="robots"')) {
      patched = patched.replace("</head>", `    ${robotsTag}\n  </head>`);
    }
  } else {
    patched = patched.replace(/\s*<meta name="robots" content="[^"]*" \/>\n?/g, "\n");
  }

  const staticBody = staticSeoMainHtml(meta.path);
  patched = patched.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">\n      ${staticBody}\n    </div>`,
  );
  patched = patched.replace(
    /<main id="bb-static-seo"[\s\S]*?<\/main>/,
    staticBody,
  );

  return patched;
}

/** Indexable marketing/legal routes emitted as static HTML at build time. */
export function listIndexablePublicRoutes(): PageMeta[] {
  return Object.values(PUBLIC_ROUTE_META).filter((meta) => meta.indexable !== false);
}

/** Non-indexable signed-out app routes emitted as noindex static HTML at build time. */
export function listNonIndexableRoutes(): PageMeta[] {
  return SIGNED_OUT_APP_ROUTES;
}
