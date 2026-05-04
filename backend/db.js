// @ts-check
/**
 * PostgreSQL connection pool (AWS RDS).
 *
 * Reads DATABASE_URL from env. When unset the pool is null and callers
 * must fall back to their existing behaviour (Clerk metadata, in-memory, etc.).
 *
 * Pool tuning knobs live in env — see backend/.env.example for docs.
 */
import pg from "pg";

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/**
 * Lazy-initialise and return the shared pool.
 * Returns `null` when DATABASE_URL is not configured.
 * @returns {pg.Pool | null}
 */
export function getPool() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: intEnv("DB_MAX_CONNECTIONS", 20),
      idleTimeoutMillis: intEnv("DB_IDLE_TIMEOUT", 30_000),
      connectionTimeoutMillis: intEnv("DB_CONNECTION_TIMEOUT", 5_000),
      maxUses: intEnv("DB_MAX_USES", 7500),
      statement_timeout: intEnv("DB_STATEMENT_TIMEOUT", 30_000),
      query_timeout: intEnv("DB_QUERY_TIMEOUT", 30_000),
      ssl: { rejectUnauthorized: false }, // sslmode=require (encrypt, skip CA verify)
    });

    pool.on("error", (err) => {
      console.error("[db] unexpected pool error:", err.message);
    });

    console.log("[db] pool created — max connections:", intEnv("DB_MAX_CONNECTIONS", 20));
  }

  return pool;
}

/**
 * Convenience: run a parameterised query against the pool.
 * Throws if the pool is not configured.
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  return p.query(text, params);
}

/**
 * Health check — attempts a simple SELECT 1.
 * @returns {Promise<{ ok: boolean, latencyMs: number, error?: string }>}
 */
export async function healthCheck() {
  const p = getPool();
  if (!p) return { ok: false, latencyMs: 0, error: "DATABASE_URL not set" };
  const start = Date.now();
  try {
    await p.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (/** @type {any} */ err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

/**
 * Graceful shutdown — drain the pool.
 * Call from process exit handlers.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[db] pool closed");
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** @param {string} key @param {number} fallback */
function intEnv(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
