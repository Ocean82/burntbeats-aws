/**
 * Copy shared/bb-favicon.png → public/favicon.png when the source exists
 * (repo-root dev). If shared/ is absent (e.g. frontend-only Docker context),
 * keep the already-committed public/favicon.png.
 */
import { copyFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "..");
const repoRoot = join(frontendRoot, "..");
const src = join(repoRoot, "shared", "bb-favicon.png");
const dest = join(frontendRoot, "public", "favicon.png");

try {
  await stat(src);
} catch {
  console.log(
    "[sync-favicon] shared/bb-favicon.png not found — using existing public/favicon.png",
  );
  process.exit(0);
}

await copyFile(src, dest);
console.log("[sync-favicon] copied shared/bb-favicon.png → public/favicon.png");
