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
import { ensureUser } from "./db-jobs.js";

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
      `SELECT balance, period_end FROM user_token_balances WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
    if (res.rows.length === 0) return { balance: 0, periodEnd: null };
    const row = res.rows[0];
    return {
      balance: row.balance,
      periodEnd: row.period_end || null,
    };
  } catch (err) {
    console.error("[db-tokens] getDbBalance failed:", err instanceof Error ? err.message : err);
    return null;
  }
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
  if (!Number.isFinite(cost) || cost <= 0) return { success: true, balanceAfter: undefined };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureUser(clerkUserId);
    await ensureBalanceRow(client, clerkUserId);

    // Lock the row
    const lockRes = await client.query(
      `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
      [clerkUserId],
    );
    const currentBalance = lockRes.rows[0]?.balance ?? 0;

    if (currentBalance < cost) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: `Insufficient usage tokens (need ${cost}, have ${currentBalance}). Upgrade your plan or wait for renewal.`,
      };
    }

    const newBalance = currentBalance - cost;

    // Update balance
    await client.query(
      `UPDATE user_token_balances SET balance = $2 WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance],
    );

    // Record transaction
    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, job_id, note)
       VALUES ($1, 'debit', $2, $3, $4, $5)`,
      [clerkUserId, -cost, newBalance, meta.jobId || null, meta.note || "split/expand debit"],
    );

    await client.query("COMMIT");
    return { success: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[db-tokens] reserveDbTokens failed:", err instanceof Error ? err.message : err);
    return { success: false, error: "Database error during token reservation" };
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
      [clerkUserId, amount, newBalance, meta.jobId || null, meta.note || "job refund"],
    );

    await client.query("COMMIT");
    return { success: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[db-tokens] refundDbTokens failed:", err instanceof Error ? err.message : err);
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
  if (!Number.isFinite(grant) || grant <= 0) return { success: true, credited: false };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureUser(clerkUserId);
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
      if (row && String(row.last_credited_period_start) === String(meta.periodStart)) {
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
      [clerkUserId, grant, newBalance, meta.stripeEventId || null, "monthly subscription credit"],
    );

    await client.query("COMMIT");
    return { success: true, credited: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[db-tokens] creditDbSubscription failed:", err instanceof Error ? err.message : err);
    return { success: false, credited: false };
  } finally {
    client.release();
  }
}

/**
 * Credit one-time top-up tokens.
 * @param {string} clerkUserId
 * @param {number} grant
 * @param {{ stripeEventId?: string, note?: string }} [meta]
 * @returns {Promise<{ success: boolean, balanceAfter?: number }>}
 */
export async function creditDbTopup(clerkUserId, grant, meta = {}) {
  const pool = getPool();
  if (!pool) return { success: false };
  if (!Number.isFinite(grant) || grant <= 0) return { success: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureUser(clerkUserId);
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
      `SELECT balance FROM user_token_balances WHERE clerk_user_id = $1 FOR UPDATE`,
      [clerkUserId],
    );
    const currentBalance = lockRes.rows[0]?.balance ?? 0;
    const newBalance = currentBalance + grant;

    await client.query(
      `UPDATE user_token_balances SET balance = $2 WHERE clerk_user_id = $1`,
      [clerkUserId, newBalance],
    );

    await client.query(
      `INSERT INTO token_transactions (clerk_user_id, tx_type, amount, balance_after, stripe_event_id, note)
       VALUES ($1, 'topup', $2, $3, $4, $5)`,
      [clerkUserId, grant, newBalance, meta.stripeEventId || null, meta.note || "one-time top-up"],
    );

    await client.query("COMMIT");
    return { success: true, balanceAfter: newBalance };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[db-tokens] creditDbTopup failed:", err instanceof Error ? err.message : err);
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
    await ensureUser(clerkUserId);
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
    console.error("[db-tokens] grantDbWelcomeTokens failed:", err instanceof Error ? err.message : err);
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
    console.error("[db-tokens] getTokenHistory failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
