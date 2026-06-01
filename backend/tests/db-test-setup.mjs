/**
 * Shared Postgres test setup: load backend/.env and run schema + migrations.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load backend/.env without overwriting existing env vars. */
export function loadBackendEnvForTests() {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // .env not found
  }
}

/**
 * @returns {string | null} DATABASE_URL when configured
 */
export function getTestDatabaseUrl() {
  return (process.env.DATABASE_URL || "").trim() || null;
}

/** Apply db-schema.sql and backend/migrations/*.sql. */
export async function ensureDatabaseMigrated() {
  const { migrate } = await import("../db-migrate.js");
  await migrate();
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} tableName
 * @param {string} columnName
 */
export async function columnExists(pool, tableName, columnName) {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [tableName, columnName],
  );
  return (result.rowCount ?? 0) > 0;
}
