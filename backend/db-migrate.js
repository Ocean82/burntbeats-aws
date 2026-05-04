#!/usr/bin/env node
// @ts-check
/**
 * Run the SQL schema against the configured DATABASE_URL.
 *
 * Usage:
 *   node backend/db-migrate.js            # uses backend/.env
 *   DATABASE_URL=... node backend/db-migrate.js
 *
 * Safe to re-run — all statements use IF NOT EXISTS / DO $$ guards.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

// Load backend/.env if present (lightweight — no dotenv dependency)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envPath = path.join(__dirname, ".env");
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env not found — rely on environment
}

const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. Set it in backend/.env or as an environment variable.");
  process.exit(1);
}

const schemaPath = path.join(__dirname, "db-schema.sql");
const sql = readFileSync(schemaPath, "utf-8");

async function migrate() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // sslmode=require: encrypt without CA verification
    connectionTimeoutMillis: 10_000,
  });

  try {
    console.log("[migrate] connecting to database...");
    await client.connect();
    console.log("[migrate] connected. running schema...");
    await client.query(sql);
    console.log("[migrate] schema applied successfully.");
  } catch (err) {
    console.error("[migrate] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
