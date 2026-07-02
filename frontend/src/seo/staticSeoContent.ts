/**
 * Crawlable HTML placed inside #root before React hydrates.
 * Googlebot indexes this first-wave payload; React replaces it on mount.
 */
export function staticSeoMainHtml(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/pricing") return pricingStaticHtml();
  if (path === "/privacy-policy") return privacyStaticHtml();
  if (path === "/terms-of-service") return termsStaticHtml();
  if (isSignedOutAppPath(path)) return appRouteStaticHtml();
  return homeStaticHtml();
}

const SIGNED_OUT_APP_PATHS = new Set([
  "/speech",
  "/midi",
  "/my-stems",
  "/beats",
  "/library",
  "/tuner",
]);

function isSignedOutAppPath(path: string): boolean {
  return SIGNED_OUT_APP_PATHS.has(path);
}

function appRouteStaticHtml(): string {
  return `
<main id="bb-static-seo" lang="en">
  <h1>Burnt Beats</h1>
  <p>
    Burnt Beats is a browser workstation for producers and DJs.
    Sign in to use the stem splitter, mixer, stem library, and MIDI converter.
  </p>
  <p>
    <a href="/">Home</a> &middot;
    <a href="/pricing">Pricing</a> &middot;
    <a href="/privacy-policy">Privacy Policy</a> &middot;
    <a href="/terms-of-service">Terms of Service</a>
  </p>
</main>`.trim();
}

function homeStaticHtml(): string {
  return `
<main id="bb-static-seo" lang="en">
  <header>
    <p>Burnt Beats — browser workstation for producers and DJs</p>
  </header>
  <h1>Burnt Beats — AI Stem Splitter, Mixer &amp; MIDI Workstation</h1>
  <p>
    Burnt Beats is the browser workstation for producers and DJs who need more than isolated files.
    Split tracks into vocals, drums, bass, and melody, shape the mix in-browser, reopen past jobs from
    Library, and move straight into MIDI or export — no install required.
  </p>
  <h2>Why Burnt Beats is different</h2>
  <p>Most stem splitters stop at the download. Burnt Beats keeps the workflow moving.</p>
  <ul>
    <li><strong>In-browser mixer and editor</strong> — Level, trim, and shape stems without bouncing to another tool.</li>
    <li><strong>Reopen past stem jobs</strong> — Return to old splits from Library instead of disposable downloads.</li>
    <li><strong>Stem-to-MIDI workflow built in</strong> — Convert separated audio to MIDI in the same session.</li>
    <li><strong>Built for producers and DJs</strong> — A lightweight browser workstation, not a one-click converter.</li>
  </ul>
  <p>
    <a href="/pricing">View pricing and plans</a> ·
    <a href="/privacy-policy">Privacy Policy</a> ·
    <a href="/terms-of-service">Terms of Service</a>
  </p>
</main>`.trim();
}

function pricingStaticHtml(): string {
  return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Burnt Beats", "item": "https://www.burntbeats.com/" },
    { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://www.burntbeats.com/pricing" }
  ]
}
</script>
<main id="bb-static-seo" lang="en">
  <h1>Pricing — Burnt Beats</h1>
  <p>
    Burnt Beats plans and one-time stem packs. Subscribe for regular workflow or buy tokens when you
    need occasional splits, mixing, and MIDI conversion in the browser. Token pricing is transparent:
    one token equals one minute of audio processing.
  </p>
  <h2>Plans for every workflow</h2>
  <ul>
    <li><strong>Subscriptions</strong> — Basic, Premium, and Studio tiers for recurring production.</li>
    <li><strong>One-time packs</strong> — Top up minutes when you split tracks occasionally.</li>
    <li><strong>Free trial</strong> — Start with a welcome grant and upgrade when you are ready.</li>
  </ul>
  <p>
    <a href="/">Back to Burnt Beats home</a> ·
    <a href="/privacy-policy">Privacy Policy</a> ·
    <a href="/terms-of-service">Terms of Service</a>
  </p>
</main>`.trim();
}

function privacyStaticHtml(): string {
  return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Burnt Beats", "item": "https://www.burntbeats.com/" },
    { "@type": "ListItem", "position": 2, "name": "Privacy Policy", "item": "https://www.burntbeats.com/privacy-policy" }
  ]
}
</script>
<main id="bb-static-seo" lang="en">
  <h1>Privacy Policy — Burnt Beats</h1>
  <p>
    How Burnt Beats collects, uses, and protects your data — including authentication, billing,
    analytics cookies, and audio processing. We use essential cookies for sign-in and optional
    analytics cookies only after consent.
  </p>
  <p><a href="/">Return to Burnt Beats</a></p>
</main>`.trim();
}

function termsStaticHtml(): string {
  return `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Burnt Beats", "item": "https://www.burntbeats.com/" },
    { "@type": "ListItem", "position": 2, "name": "Terms of Service", "item": "https://www.burntbeats.com/terms-of-service" }
  ]
}
</script>
<main id="bb-static-seo" lang="en">
  <h1>Terms of Service — Burnt Beats</h1>
  <p>
    Terms governing use of the Burnt Beats browser music workstation, subscriptions, one-time packs,
    and stem processing services.
  </p>
  <p><a href="/">Return to Burnt Beats</a></p>
</main>`.trim();
}
