import { describe, expect, it } from "vitest";
import { patchIndexHtml } from "./patchIndexHtml";
import { resolvePageMeta } from "./siteMeta";
import { staticSeoMainHtml } from "./staticSeoContent";

describe("staticSeoMainHtml", () => {
  it("includes an H1 and pricing link on the home route", () => {
    const html = staticSeoMainHtml("/");
    expect(html).toContain("<h1>");
    expect(html).toContain("browser workstation");
    expect(html).toContain('href="/pricing"');
  });

  it("returns pricing-specific copy for /pricing", () => {
    const html = staticSeoMainHtml("/pricing");
    expect(html).toContain("Pricing — Burnt Beats");
    expect(html).toContain("one-time stem packs");
  });

  it("returns sign-in message for signed-out app paths, not home page copy", () => {
    const html = staticSeoMainHtml("/midi");
    expect(html).toContain("Sign in to use");
    expect(html).not.toContain("Why Burnt Beats is different");
  });

  it("includes BreadcrumbList JSON-LD on pricing page", () => {
    const html = staticSeoMainHtml("/pricing");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain('"name": "Pricing"');
  });
});

describe("patchIndexHtml", () => {
  const template = `<!doctype html>
<html lang="en">
  <head>
    <title>Old title</title>
    <meta name="description" content="Old description" />
    <meta property="og:title" content="Old og title" />
    <meta property="og:description" content="Old og description" />
    <meta property="og:url" content="https://example.com/" />
    <meta name="twitter:title" content="Old twitter title" />
    <meta name="twitter:description" content="Old twitter description" />
    <link rel="canonical" href="https://example.com/" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

  it("patches head tags and injects static SEO body for pricing", () => {
    const meta = resolvePageMeta("/pricing");
    const html = patchIndexHtml(template, meta);

    expect(html).toContain("<title>Pricing — Burnt Beats</title>");
    expect(html).toContain('href="https://www.burntbeats.com/pricing"');
    expect(html).toContain('id="bb-static-seo"');
    expect(html).toContain("one-time stem packs");
  });

  it("injects noindex meta and sign-in message for signed-out app paths", () => {
    const meta = resolvePageMeta("/midi");
    const html = patchIndexHtml(template, meta);

    expect(html).toContain('name="robots"');
    expect(html).toContain("noindex");
    expect(html).toContain("Sign in to use");
    expect(html).not.toContain("Why Burnt Beats is different");
  });
});
