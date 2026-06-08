/**
 * Generate missing public assets from the existing logo-emblem.png.
 *
 * Usage: npx --yes sharp-cli resize public/logo-emblem.png ...
 * Or:    node scripts/generate-assets.mjs  (requires sharp as a dev dep)
 *
 * This script creates:
 * - public/apple-touch-icon.png  (180×180, logo centered on brand bg)
 * - public/logo-emblem-512.png   (512×512, logo centered on brand bg)
 * - public/og-image.png          (1200×630, brand lockup for social sharing)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "public");
const logo = resolve(publicDir, "logo-emblem.png");

if (!existsSync(logo)) {
  console.error("❌ public/logo-emblem.png not found");
  process.exit(1);
}

// Ensure sharp is available
try {
  await import("sharp");
} catch {
  console.log("Installing sharp (one-time)…");
  execSync("npm install --no-save sharp", { cwd: root, stdio: "inherit" });
}

const sharp = (await import("sharp")).default;

// --- apple-touch-icon.png: 180×180, emblem centered on brand bg ---
const TOUCH_SIZE = 180;
const TOUCH_PADDING = 24;
const emblemForTouch = await sharp(logo)
  .resize(TOUCH_SIZE - TOUCH_PADDING * 2, TOUCH_SIZE - TOUCH_PADDING * 2, { fit: "inside" })
  .toBuffer();

await sharp({
  create: { width: TOUCH_SIZE, height: TOUCH_SIZE, channels: 4, background: { r: 5, g: 3, b: 2, alpha: 1 } },
})
  .composite([{ input: emblemForTouch, gravity: "centre" }])
  .png()
  .toFile(resolve(publicDir, "apple-touch-icon.png"));

console.log("✓ apple-touch-icon.png (180×180)");

// --- logo-emblem-512.png: 512×512, emblem centered on brand bg ---
const ICON_SIZE = 512;
const ICON_PADDING = 64;
const emblemForIcon = await sharp(logo)
  .resize(ICON_SIZE - ICON_PADDING * 2, ICON_SIZE - ICON_PADDING * 2, { fit: "inside" })
  .toBuffer();

await sharp({
  create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { r: 5, g: 3, b: 2, alpha: 1 } },
})
  .composite([{ input: emblemForIcon, gravity: "centre" }])
  .png()
  .toFile(resolve(publicDir, "logo-emblem-512.png"));

console.log("✓ logo-emblem-512.png (512×512)");

// --- og-image.png: 1200×630, emblem + brand text ---
const OG_W = 1200;
const OG_H = 630;
const EMBLEM_SIZE = 120;

const emblemForOg = await sharp(logo)
  .resize(EMBLEM_SIZE, EMBLEM_SIZE, { fit: "inside" })
  .toBuffer();

// Create an SVG overlay for the text (avoids needing canvas/font rendering)
const textSvg = Buffer.from(`
<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ember" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff5500"/>
      <stop offset="100%" stop-color="#ffbb33"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="rgba(255,80,20,0.18)"/>
      <stop offset="60%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <text x="50%" y="390" text-anchor="middle" font-family="system-ui,sans-serif" font-size="72" font-weight="700" fill="url(#ember)">Burnt Beats</text>
  <text x="50%" y="450" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" font-weight="400" fill="#f5f0ebcc">AI Stem Splitter &amp; Mixing Workstation</text>
</svg>
`);

await sharp({
  create: { width: OG_W, height: OG_H, channels: 4, background: { r: 5, g: 3, b: 2, alpha: 1 } },
})
  .composite([
    { input: textSvg, blend: "over" },
    { input: emblemForOg, gravity: "north", top: 180, left: Math.round((OG_W - EMBLEM_SIZE) / 2) },
  ])
  .png()
  .toFile(resolve(publicDir, "og-image.png"));

console.log("✓ og-image.png (1200×630)");
console.log("\nAll assets generated in public/");
