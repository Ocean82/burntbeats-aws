#!/usr/bin/env node
/**
 * Delete stem job directories older than STEM_CLEANUP_MAX_AGE_HOURS (default 24).
 * Only removes dirs whose names are UUIDs. Run from cron or manually.
 * Usage: node scripts/cleanup-stems.js [maxAgeHours]
 */
const { readdirSync, rmSync, statSync } = require("fs");
const path = require("path");

const STEM_OUTPUT_DIR = path.resolve(
  process.env.STEM_OUTPUT_DIR || path.join(__dirname, "..", "tmp", "stems")
);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const maxAgeHours = Math.max(
  0,
  Number(process.argv[2] ?? process.env.STEM_CLEANUP_MAX_AGE_HOURS ?? 24)
);
const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

let deleted = 0;
try {
  const entries = readdirSync(STEM_OUTPUT_DIR, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!UUID_REGEX.test(ent.name)) continue;
    const dirPath = path.join(STEM_OUTPUT_DIR, ent.name);
    const stat = statSync(dirPath);
    if (stat.mtime.getTime() < cutoff) {
      rmSync(dirPath, { recursive: true });
      deleted++;
    }
  }
} catch (e) {
  if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
    console.log("Output dir does not exist:", STEM_OUTPUT_DIR);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
}

console.log(`Cleaned ${deleted} job(s) older than ${maxAgeHours}h in ${STEM_OUTPUT_DIR}`);
