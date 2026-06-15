#!/usr/bin/env node
/**
 * Bulk-replace hardcoded Tailwind colors with semantic tokens.
 * Excludes: pitch-tempo-plugin, *.test.*, demo-dist
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  resolvePathWithinBase,
} from "../../backend/helpers/safePath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src");

const EXCLUDE_DIR = new Set(["pitch-tempo-plugin", "demo-dist", "node_modules"]);
const HEX_BG = /bg-\[#[0-9a-fA-F]{3,8}\]/g;

function shouldSkip(filePath) {
  const norm = filePath.split(path.sep).join("/");
  if (norm.includes("pitch-tempo-plugin") || norm.includes("demo-dist")) return true;
  if (/\.test\.(tsx|ts|jsx|js|css)$/.test(norm)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = resolvePathWithinBase(dir, ent.name);
    if (!p) continue;
    if (ent.isDirectory()) {
      if (EXCLUDE_DIR.has(ent.name)) continue;
      walk(p, out);
    } else if (/\.(tsx|css)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function mapTextWhiteOpacity(opacity) {
  const n = Number(opacity);
  if (n >= 70) return "text-secondary-foreground";
  return "text-muted-foreground";
}

function mapBgBlackOpacity(opacity) {
  const n = Number(opacity);
  if (n >= 70) return "bg-chrome";
  if (n >= 40) return "bg-secondary";
  if (n >= 20) return "bg-muted";
  return "bg-popover";
}

function mapBgWhiteOpacity(opacity) {
  const n = Number(opacity);
  if (n <= 10) return "bg-muted";
  return "bg-secondary";
}

function migrateContent(text) {
  let s = text;

  s = s.replace(HEX_BG, "bg-popover");

  s = s.replace(/text-white\/(\d+)/g, (_, op) => mapTextWhiteOpacity(op));
  s = s.replace(/\btext-white\b/g, "text-foreground");

  s = s.replace(/border-white\/(\d+)/g, "border-border");
  s = s.replace(/\bborder-white\b/g, "border-border");

  s = s.replace(/bg-white\/(\d+)/g, (_, op) => mapBgWhiteOpacity(op));
  s = s.replace(/\bbg-white\b/g, "bg-muted");

  s = s.replace(/bg-black\/(\d+)/g, (_, op) => mapBgBlackOpacity(op));
  s = s.replace(/\bbg-black\b/g, "bg-chrome");

  const families = [
    ["amber", "primary"],
    ["cyan", "info"],
    ["violet", "accent-midi"],
    ["emerald", "success"],
    ["rose", "destructive"],
    ["red", "destructive"],
  ];
  for (const [from, to] of families) {
    const re = new RegExp(`\\b${from}-`, "g");
    s = s.replace(re, `${to}-`);
  }

  return s;
}

const files = walk(SRC).filter((f) => !shouldSkip(f));
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = migrateContent(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed++;
  }
}

console.log(JSON.stringify({ filesScanned: files.length, filesChanged: changed }));
