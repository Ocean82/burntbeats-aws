// @ts-check
/**
 * Database-backed usage token operations.
 *
 * This module provides the same reserve/refund/credit semantics as the
 * Clerk-metadata approach in usageTokens.js, but persists to PostgreSQL
 * with a proper transaction ledger.
 *
 * When DATABASE_URL is configured, these functions are the primary store.
 * The Clerk metadata is still updated as a secondary cache (for fast reads
 * from the billing/usage endpoint without a DB round-trip).
 *
 * All functions return gracefully when the pool is unavailable.
 */
import { getPool } from "./db.js";
// NOTE: ensureUser from db-jobs.js is no longer used here — user row creation
// is done inline within each transaction to prevent FK race conditions.

/**
 * Ensure a user_token_balances row exists for the user.
 * @param {import("pg").PoolClient} client - transaction client
 * @param {string} clerkUserId
 */
async function ensureBalanceRow(client, clerkUserId) {
  await client.query(
    `INSERT INTO user_token_balances (clerk_user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (clerk_user_id) DO NOTHING`,
    [clerkUserId],
  );
}

/**
 * Check if the DB token system is available.
 * @returns {boolean}
 */
export function isDbTokensAvailable() {
  return getPool() !== null;
}

/**
 * Get the user's current token balance from the database.
 * @param {string} clerkUserId
 * @returns {Promise<{ balance: number, periodEnd: Date | null } | null>}
 */
export async function getDbBalance(clerkUserId) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const res = await pool.query(
      `SELECT balance, period_end, max_entitlement_tier, free_monthly_remaining,
              free_monthly_period, welcome_granted
       FROM user_token_balances WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
    if (res.rows.length === 0) {
      return {
        balance: 0,
        periodEnd: null,
        maxEntitlementTier: "basic",
        freeMonthlyRemaining: freeMonthlyAllowanceDefault(),
        freeMonthlyPeriod: null,
        welcomeGranted: false,
      };
    }
    const row = res.rows[0];
    return {
      balance: row.balance,
      periodEnd: row.period_end || null,
      maxEntitlementTier:
        row.max_entitlement_tier === "premium" ? "premium" : "basic",
      freeMonthlyRemaining:
        row.free_monthly_remaining ?? freeMonthlyAllowanceDefault(),
      freeMonthlyPeriod: row.free_monthly_period || null,
      welcomeGranted: Boolean(row.welcome_granted),
    };
  } catch (err) {
    console.error(
      "[db-tokens] getDbBalance failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** @returns {number} */
function freeMonthlyAllowanceDefault() {
  const n = Number(process.env.FREE_MONTHLY_ALLOWANCE_MINUTES);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}

/** @returns {boolean} */
export function isFreeMonthlyAllowanceEnabled() {
  return !["0", "false", "no"].includes(
    (process.env.FREE_MONTHLY_ALLOWANCE_ENABLED || "1").toLowerCase(),
  );
}

/** @returns {string} YYYY-MM UTC */
function currentMonthPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} clerkUserId
 * @param {{ free_monthly_remaining?: number, free_monthly_period?: string | null }} row
 * @returns {Promise<number>}
 */
async function syncFreeMonthlyPeriod(client, clerkUserId, row) {
  const period = currentMonthPeriod();
  const allowance = freeMonthlyAllowanceDefault();
  if (row.free_monthly_period !== period) {
    await client.query(
      `UPDATE user_token_balances
       SET free_monthly_remaining = $2, free_monthly_period = $3
       WHERE clerk_user_id = $1`,
      [clerkUserId, allowance, period],
    );
    return allowance;
  }
  return row.free_monthly_remaining ?? allowance;
}

/**
 * Reserve (debit) tokens for a job. Uses SELECT FOR UPDATE to prevent races.
 * @param {string} clerkUserId
 * @param {number} cost
 * @param {{ jobId?: string, note?: string }} [meta]
 * @returns {Promise<{ success: boolean, balanceAfter?: number, error?: string }>}
 */
export async function reserveDbTokens(clerkUserId, cost, meta = {}) {
  const pool = getPool();
  if (!pool) return { success: false, error: "DB not available" };
  if (!Number.isFinite(cost) || cost <= 0)
    return { success: true, balanceAfter: undefined };

  // DB column is integer — ceil fractional costs to prevent type errors
  const intCost = Math.ceil(cost);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure user row exists WITHIN the transaction to prevent FK violations.
    // Previously ensureUser() used a separate pool connection which could race
    // with ensureBalanceRow's FK reference to users(clerk_user_id).
    await client.query(
      `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId],
    );
    await ensureBalanceRow(client, clerkUserId);

    // Lock the row — use column list that works whether or not migration 003 has been applied
    let row;
    try {
      const lockRes = await client.query(
        `SELECT balance, free_monthly_remaining, free_monthly_period
         FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
        [clerkUserId],
      );
      row = lockRes.rows[0];
    } catch (colErr) {
      // If free_monthly columns don't exist (migration 003 not applied), fall back to balance-only
      if (colErr.code === "42703") {
        console.warn(
          "[db-tokens] free_monthly columns missing — run db:migrate to apply migration 003",
        );
        const lockRes = await client.query(
          `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
          [clerkUserId],
        );
        row = lockRes.rows[0];
      } else {
        throw colErr;
      }
    }
    const currentBalance = row?.balance ?? 0;

    if (currentBalance >= intCost) {
      const newBalance = currentBalance - intCost;
      await client.query(
        `UPDATE user_token_balances SET balance = $2 WHERE clerk_user_id = $1`,
        [clerkUserId, newBalance],
      );
      await client.query(
        `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, job_id, note)
         VALUES ($1, 'debit', $2, $3, $4, $5)`,
        [
          clerkUserId,
          -intCost,
          newBalance,
          meta.jobId || null,
          meta.note || "split/expand debit",
        ],
      );
      await client.query("COMMIT");
      return { success: true, balanceAfter: newBalance, source: "paid" };
    }

    // Free monthly allowance path — only if columns exist on the row
    if (
      isFreeMonthlyAllowanceEnabled() &&
      row &&
      row.free_monthly_remaining !== undefined
    ) {
      const freeRemaining = await syncFreeMonthlyPeriod(
        client,
        clerkUserId,
        row,
      );
      if (freeRemaining >= intCost) {
        const newFree = freeRemaining - intCost;
        await client.query(
          `UPDATE user_token_balances SET free_monthly_remaining = $2 WHERE clerk_user_id = $1`,
          [clerkUserId, newFree],
        );
        // Use 'debit' tx_type as fallback if 'free_monthly_debit' enum value doesn't exist yet
        let txType = "free_monthly_debit";
        try {
          await client.query(
            `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, job_id, note)
             VALUES ($1, $2::token_tx_type, $3, $4, $5, $6)`,
            [
              clerkUserId,
              txType,
              -intCost,
              currentBalance,
              meta.jobId || null,
              meta.note || "free monthly allowance debit",
            ],
          );
        } catch (enumErr) {
          // If 'free_monthly_debit' enum value doesn't exist (migration 003 not fully applied),
          // fall back to 'debit' which always exists in the base schema
          if (enumErr.code === "22P02") {
            console.warn(
              "[db-tokens] 'free_monthly_debit' enum missing — using 'debit' fallback. Run db:migrate.",
            );
            txType = "debit";
            await client.query(
              `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, job_id, note)
               VALUES ($1, $2::token_tx_type, $3, $4, $5, $6)`,
              [
                clerkUserId,
                txType,
                -intCost,
                currentBalance,
                meta.jobId || null,
                meta.note || "free monthly allowance debit (enum fallback)",
              ],
            );
          } else {
            throw enumErr;
          }
        }
        await client.query("COMMIT");
        return {
          success: true,
          balanceAfter: currentBalance,
          source: "free_monthly",
        };
      }
    }

    await client.query("ROLLBACK");
    return {
      success: false,
      error: `Insufficient usage tokens (need ${intCost}, have ${currentBalance}). Upgrade your plan or wait for renewal.`,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const pgCode = err?.code || "unknown";
    const pgConstraint = err?.constraint || "";
    const pgDetail = err?.detail || "";
    console.error("[db-tokens] reserveDbTokens failed:", {
      message: err instanceof Error ? err.message : String(err),
      code: pgCode,
      constraint: pgConstraint,
      detail: pgDetail,
      userId: clerkUserId,
      cost: intCost,
    });
    return {
      success: false,
      error:
        "Database error during token reservation. Please try again or contact support if this persists.",
    };
  } finally {
    client.release();
  }
}

/**
 * Refund tokens (compensating action for failed jobs).
 * @param {string} clerkUserId
 * @param {number} amount
 * @param {{ jobId?: string, note?: string }} [meta]
 * @returns {Promise<{ success: boolean, balanceAfter?: number }>}
 */
export async function refundDbTokens(clerkUserId, amount, meta = {}) {
  const pool = getPool();
  if (!pool) return { success: false };
  if (!Number.isFinite(amount) || amount <= 0) return { success: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Ensure user row exists within the transaction (FK for user_token_balances)
    await client.query(
      `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId],
    );
    await ensureBalanceRow(client, clerkUserId);

    const lockRes = await client.query(
      `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
      [clerkUserId],
    );
    const currentBalance = lockRes.rows[0]?.balance ?? 0;
    const newBalance = currentBalance + amount;

    await client.query(
      `UPDATE user_token_balances SET balance = $2 WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance],
    );

    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, job_id, note)
       VALUES ($1, 'refund', $2, $3, $4, $5)`,
      [
        clerkUserId,
        amount,
        newBalance,
        meta.jobId || null,
        meta.note || "job refund",
      ],
    );

    await client.query("COMMIT");
    return { success: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "[db-tokens] refundDbTokens failed:",
      err instanceof Error ? err.message : err,
    );
    return { success: false };
  } finally {
    client.release();
  }
}

/**
 * Credit subscription allowance (monthly renewal).
 * Idempotent: skips if the same period_start was already credited.
 * @param {string} clerkUserId
 * @param {number} grant
 * @param {{ periodStart?: number, periodEnd?: number, stripeEventId?: string }} [meta]
 * @returns {Promise<{ success: boolean, credited: boolean, balanceAfter?: number }>}
 */
export async function creditDbSubscription(clerkUserId, grant, meta = {}) {
  const pool = getPool();
  if (!pool) return { success: false, credited: false };
  if (!Number.isFinite(grant) || grant <= 0)
    return { success: true, credited: false };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId],
    );
    await ensureBalanceRow(client, clerkUserId);

    // Idempotency: check stripe_event_id
    if (meta.stripeEventId) {
      const dup = await client.query(
        `SELECT id FROM token_transactions WHERE stripe_event_id = $1 LIMIT 1`,
        [meta.stripeEventId],
      );
      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        return { success: true, credited: false };
      }
    }

    // Idempotency: check period_start
    if (meta.periodStart != null) {
      const lockRes = await client.query(
        `SELECT balance, last_credited_period_start FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
        [clerkUserId],
      );
      const row = lockRes.rows[0];
      // pg returns BIGINT as string; coerce both sides for safe comparison
      if (
        row &&
        String(row.last_credited_period_start) === String(meta.periodStart)
      ) {
        await client.query("ROLLBACK");
        return { success: true, credited: false };
      }
    } else {
      await client.query(
        `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
        [clerkUserId],
      );
    }

    const lockRes2 = await client.query(
      `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
    const currentBalance = lockRes2.rows[0]?.balance ?? 0;
    const newBalance = currentBalance + grant;

    const periodEndTs = meta.periodEnd ? new Date(meta.periodEnd * 1000) : null;

    await client.query(
      `UPDATE user_token_balances
       SET balance = $2, period_end = $3, last_credited_period_start = $4
       WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance, periodEndTs, meta.periodStart || null],
    );

    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, stripe_event_id, note)
       VALUES ($1, 'subscription', $2, $3, $4, $5)`,
      [
        clerkUserId,
        grant,
        newBalance,
        meta.stripeEventId || null,
        "monthly subscription credit",
      ],
    );

    await client.query("COMMIT");
    return { success: true, credited: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "[db-tokens] creditDbSubscription failed:",
      err instanceof Error ? err.message : err,
    );
    return { success: false, credited: false };
  } finally {
    client.release();
  }
}

/**
 * Credit one-time top-up tokens.
 * @param {string} clerkUserId
 * @param {number} grant
 * @param {{ stripeEventId?: string, note?: string, entitlementTier?: "basic" | "premium" }} [meta]
 * @returns {Promise<{ success: boolean, balanceAfter?: number }>}
 */
export async function creditDbTopup(clerkUserId, grant, meta = {}) {
  const pool = getPool();
  if (!pool) return { success: false };
  if (!Number.isFinite(grant) || grant <= 0) return { success: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId],
    );
    await ensureBalanceRow(client, clerkUserId);

    // Idempotency
    if (meta.stripeEventId) {
      const dup = await client.query(
        `SELECT id FROM token_transactions WHERE stripe_event_id = $1 LIMIT 1`,
        [meta.stripeEventId],
      );
      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        return { success: true };
      }
    }

    const lockRes = await client.query(
      `SELECT balance, max_entitlement_tier FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
      [clerkUserId],
    );
    const currentBalance = lockRes.rows[0]?.balance ?? 0;
    const newBalance = currentBalance + grant;
    const incomingTier =
      meta.entitlementTier === "premium" ? "premium" : "basic";
    const prevTier =
      lockRes.rows[0]?.max_entitlement_tier === "premium" ? "premium" : "basic";
    const nextTier =
      incomingTier === "premium" || prevTier === "premium" ?
        "premium"
      : "basic";

    await client.query(
      `UPDATE user_token_balances SET balance = $2, max_entitlement_tier = $3 WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance, nextTier],
    );

    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, stripe_event_id, note)
       VALUES ($1, 'topup', $2, $3, $4, $5)`,
      [
        clerkUserId,
        grant,
        newBalance,
        meta.stripeEventId || null,
        meta.note || "one-time top-up",
      ],
    );

    await client.query("COMMIT");
    return { success: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "[db-tokens] creditDbTopup failed:",
      err instanceof Error ? err.message : err,
    );
    return { success: false };
  } finally {
    client.release();
  }
}

/**
 * Grant welcome signup tokens (idempotent — only once per user).
 * @param {string} clerkUserId
 * @param {number} grant
 * @returns {Promise<{ success: boolean, granted: boolean, balanceAfter?: number }>}
 */
export async function grantDbWelcomeTokens(clerkUserId, grant) {
  const pool = getPool();
  if (!pool) return { success: false, granted: false };
  const amount = Number.isFinite(grant) ? Math.floor(grant) : 1;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId],
    );
    await ensureBalanceRow(client, clerkUserId);

    const lockRes = await client.query(
      `SELECT balance, welcome_granted FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
      [clerkUserId],
    );
    const row = lockRes.rows[0];
    if (row && row.welcome_granted) {
      await client.query("ROLLBACK");
      return { success: true, granted: false, balanceAfter: row.balance };
    }

    const currentBalance = row?.balance ?? 0;
    const newBalance = currentBalance + amount;

    await client.query(
      `UPDATE user_token_balances SET balance = $2, welcome_granted = TRUE WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance],
    );

    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, note)
       VALUES ($1, 'welcome', $2, $3, $4)`,
      [clerkUserId, amount, newBalance, "signup welcome grant"],
    );

    await client.query("COMMIT");
    return { success: true, granted: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "[db-tokens] grantDbWelcomeTokens failed:",
      err instanceof Error ? err.message : err,
    );
    return { success: false, granted: false };
  } finally {
    client.release();
  }
}

/**
 * Get recent token transaction history for a user.
 * @param {string} clerkUserId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getTokenHistory(clerkUserId, opts = {}) {
  const pool = getPool();
  if (!pool) return [];
  const limit = opts.limit || 50;
  try {
    const res = await pool.query(
      `SELECT id, tx_type, amount, balance_after, job_id, stripe_event_id, note, created_at
       FROM token_transactions
       WHERE clerk_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [clerkUserId, limit],
    );
    return res.rows;
  } catch (err) {
    console.error(
      "[db-tokens] getTokenHistory failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
