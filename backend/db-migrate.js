#!/usr/bin/env node
// @ts-check
/**
 * Run the SQL schema and incremental migrations against DATABASE_URL.
 *
 * Usage:
 *   node backend/db-migrate.js            # uses backend/.env
 *   DATABASE_URL=... node backend/db-migrate.js
 *
 * Safe to re-run — schema uses IF NOT EXISTS; migrations are idempotent.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} [envFilePath] */
export function loadBackendEnv(envFilePath) {
  const envPath = envFilePath ?? path.join(__dirname, ".env");
  try {
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
}

/**
 * Apply db-schema.sql then backend/migrations/*.sql in lexicographic order.
 * @param {import("pg").Client | import("pg").PoolClient} client
 */
const MIGRATE_ADVISORY_LOCK_KEY = 0x425242; // "BRB" — serializes concurrent migrate callers (e.g. parallel tests)

export async function runMigrations(client) {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATE_ADVISORY_LOCK_KEY]);
  try {
    const schemaPath = path.join(__dirname, "db-schema.sql");
    const schemaSql = readFileSync(schemaPath, "utf-8");
    console.log("[migrate] applying db-schema.sql...");
    await client.query(schemaSql);
    console.log("[migrate] schema applied.");

    const migrationsDir = path.join(__dirname, "migrations");
    let migrationFiles = [];
    try {
      migrationFiles = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      console.log("[migrate] no migrations directory; skipping incremental migrations.");
      return;
    }

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      const migrationSql = readFileSync(migrationPath, "utf-8");
      console.log(`[migrate] applying ${file}...`);
      await client.query(migrationSql);
      console.log(`[migrate] ${file} applied.`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATE_ADVISORY_LOCK_KEY]);
  }
}

/**
 * @param {string} [databaseUrl]
 * @returns {Promise<void>}
 */
export async function migrate(databaseUrl) {
  const url = (databaseUrl ?? process.env.DATABASE_URL ?? "").trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it in backend/.env or as an environment variable.",
    );
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  try {
    console.log("[migrate] connecting to database...");
    await client.connect();
    console.log("[migrate] connected.");
    await runMigrations(client);
    console.log("[migrate] all migrations completed successfully.");
  } finally {
    await client.end();
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  loadBackendEnv();
  const DATABASE_URL = (process.env.DATABASE_URL || "").trim();
  if (!DATABASE_URL) {
    console.error(
      "ERROR: DATABASE_URL is not set. Set it in backend/.env or as an environment variable.",
    );
    process.exit(1);
  }
  migrate(DATABASE_URL).catch((err) => {
    console.error("[migrate] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
