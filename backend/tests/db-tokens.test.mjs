/**
 * Integration tests for the database-backed token ledger (db-tokens.js).
 *
 * These tests use a real PostgreSQL connection (DATABASE_URL from backend/.env or env).
 * They create isolated test users per run and clean up after themselves.
 *
 * Run:
 *   node --test backend/tests/db-tokens.test.mjs
 *
 * Requirements:
 *   - DATABASE_URL pointing to a test-safe Postgres instance
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  ensureDatabaseMigrated,
  getTestDatabaseUrl,
  loadBackendEnvForTests,
} from "./db-test-setup.mjs";

loadBackendEnvForTests();

const DATABASE_URL = getTestDatabaseUrl();
if (!DATABASE_URL) {
  test("db-tokens: SKIPPED (no DATABASE_URL configured)", () => {
    console.log("Skipping db-tokens tests — set DATABASE_URL to run them.");
  });
  process.exit(0);
}

process.env.NODE_ENV = "test";
await ensureDatabaseMigrated();

const { getPool } = await import("../db.js");
const {
  isDbTokensAvailable,
  getDbBalance,
  reserveDbTokens,
  refundDbTokens,
  creditDbSubscription,
  creditDbTopup,
  grantDbWelcomeTokens,
  getTokenHistory,
} = await import("../db-tokens.js");

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique test user ID to avoid collisions between test runs. */
function testUserId() {
  return `test_user_${randomUUID().slice(0, 12)}`;
}

/** Seed a user row (required by FK constraints). */
async function seedUser(userId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO users (clerk_user_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, `${userId}@test.local`],
  );
}

/** Seed a user with a specific starting balance. */
async function seedUserWithBalance(userId, balance) {
  await seedUser(userId);
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_token_balances (clerk_user_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (clerk_user_id) DO UPDATE SET balance = $2`,
    [userId, balance],
  );
}

/** Clean up test user data after each test. */
async function cleanupUser(userId) {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`DELETE FROM token_transactions WHERE clerk_user_id = $1`, [userId]);
  await pool.query(`DELETE FROM user_token_balances WHERE clerk_user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE clerk_user_id = $1`, [userId]);
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("isDbTokensAvailable returns true when DATABASE_URL is set", () => {
  assert.equal(isDbTokensAvailable(), true);
});

test("getDbBalance returns 0 for a new user", async () => {
  const userId = testUserId();
  await seedUser(userId);
  try {
    const result = await getDbBalance(userId);
    assert.notEqual(result, null);
    assert.equal(result.balance, 0);
    assert.equal(result.periodEnd, null);
  } finally {
    await cleanupUser(userId);
  }
});

test("getDbBalance returns null for non-existent user (no balance row)", async () => {
  const userId = testUserId();
  // Don't seed — user doesn't exist in DB
  const result = await getDbBalance(userId);
  // Should return { balance: 0, periodEnd: null } because the query returns 0 rows
  assert.notEqual(result, null);
  assert.equal(result.balance, 0);
});

// ── Reserve (Debit) Tests ───────────────────────────────────────────────────

test("reserveDbTokens succeeds when balance is sufficient", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 100);
  try {
    const result = await reserveDbTokens(userId, 5, { jobId: randomUUID(), note: "test debit" });
    assert.equal(result.success, true);
    assert.equal(result.balanceAfter, 95);

    // Verify balance in DB
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 95);

    // Verify transaction was recorded
    const history = await getTokenHistory(userId, { limit: 1 });
    assert.equal(history.length, 1);
    assert.equal(history[0].tx_type, "debit");
    assert.equal(history[0].amount, -5);
    assert.equal(history[0].balance_after, 95);
  } finally {
    await cleanupUser(userId);
  }
});

test("reserveDbTokens fails with insufficient balance (402 scenario)", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 3);
  try {
    const result = await reserveDbTokens(userId, 10, { note: "should fail" });
    assert.equal(result.success, false);
    assert.ok(result.error.includes("Insufficient"));
    assert.ok(result.error.includes("need 10"));
    assert.ok(result.error.includes("have 3"));

    // Balance should be unchanged
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 3);

    // No transaction should be recorded
    const history = await getTokenHistory(userId);
    assert.equal(history.length, 0);
  } finally {
    await cleanupUser(userId);
  }
});

test("reserveDbTokens with zero cost is a no-op success", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 50);
  try {
    const result = await reserveDbTokens(userId, 0);
    assert.equal(result.success, true);

    // Balance unchanged
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 50);
  } finally {
    await cleanupUser(userId);
  }
});

test("reserveDbTokens with negative cost is a no-op success", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 50);
  try {
    const result = await reserveDbTokens(userId, -5);
    assert.equal(result.success, true);
  } finally {
    await cleanupUser(userId);
  }
});

test("reserveDbTokens drains balance to exactly zero", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 7);
  try {
    const result = await reserveDbTokens(userId, 7);
    assert.equal(result.success, true);
    assert.equal(result.balanceAfter, 0);

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 0);
  } finally {
    await cleanupUser(userId);
  }
});

// ── Refund Tests ────────────────────────────────────────────────────────────

test("refundDbTokens restores balance correctly", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 50);
  try {
    // Debit first
    await reserveDbTokens(userId, 20, { note: "initial debit" });
    const afterDebit = await getDbBalance(userId);
    assert.equal(afterDebit.balance, 30);

    // Refund
    const jobId = randomUUID();
    const result = await refundDbTokens(userId, 20, { jobId, note: "test refund" });
    assert.equal(result.success, true);
    assert.equal(result.balanceAfter, 50);

    // Verify balance restored
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 50);

    // Verify refund transaction recorded
    const history = await getTokenHistory(userId, { limit: 5 });
    const refundTx = history.find((tx) => tx.tx_type === "refund");
    assert.ok(refundTx);
    assert.equal(refundTx.amount, 20);
    assert.equal(refundTx.balance_after, 50);
    assert.equal(refundTx.job_id, jobId);
  } finally {
    await cleanupUser(userId);
  }
});

test("refundDbTokens with zero amount is a no-op", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 10);
  try {
    const result = await refundDbTokens(userId, 0);
    assert.equal(result.success, true);
  } finally {
    await cleanupUser(userId);
  }
});

// ── Subscription Credit Tests ───────────────────────────────────────────────

test("creditDbSubscription credits tokens on first call", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 0);
  try {
    const periodStart = Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 24 * 3600;
    const eventId = `evt_test_${randomUUID().slice(0, 8)}`;

    const result = await creditDbSubscription(userId, 120, {
      periodStart,
      periodEnd,
      stripeEventId: eventId,
    });
    assert.equal(result.success, true);
    assert.equal(result.credited, true);
    assert.equal(result.balanceAfter, 120);

    // Verify balance
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 120);

    // Verify transaction
    const history = await getTokenHistory(userId, { limit: 1 });
    assert.equal(history[0].tx_type, "subscription");
    assert.equal(history[0].amount, 120);
    assert.equal(history[0].stripe_event_id, eventId);
  } finally {
    await cleanupUser(userId);
  }
});

test("creditDbSubscription is idempotent — same stripe_event_id does not double-credit", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 0);
  try {
    const periodStart = Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 24 * 3600;
    const eventId = `evt_test_${randomUUID().slice(0, 8)}`;

    // First call — should credit
    const r1 = await creditDbSubscription(userId, 120, { periodStart, periodEnd, stripeEventId: eventId });
    assert.equal(r1.credited, true);
    assert.equal(r1.balanceAfter, 120);

    // Second call with same event ID — should NOT credit again
    const r2 = await creditDbSubscription(userId, 120, { periodStart, periodEnd, stripeEventId: eventId });
    assert.equal(r2.success, true);
    assert.equal(r2.credited, false);

    // Balance should still be 120, not 240
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 120);

    // Only one transaction should exist
    const history = await getTokenHistory(userId);
    const subTxs = history.filter((tx) => tx.tx_type === "subscription");
    assert.equal(subTxs.length, 1);
  } finally {
    await cleanupUser(userId);
  }
});

test("creditDbSubscription is idempotent — same period_start does not double-credit", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 0);
  try {
    const periodStart = Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 24 * 3600;

    // First call with event A
    const r1 = await creditDbSubscription(userId, 120, {
      periodStart,
      periodEnd,
      stripeEventId: `evt_a_${randomUUID().slice(0, 8)}`,
    });
    assert.equal(r1.credited, true);

    // Second call with DIFFERENT event ID but same period_start
    const r2 = await creditDbSubscription(userId, 120, {
      periodStart,
      periodEnd,
      stripeEventId: `evt_b_${randomUUID().slice(0, 8)}`,
    });
    assert.equal(r2.success, true);
    assert.equal(r2.credited, false);

    // Balance should be 120
    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 120);
  } finally {
    await cleanupUser(userId);
  }
});

test("creditDbSubscription allows credit for a new billing period", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 0);
  try {
    const period1Start = 1700000000;
    const period1End = 1702600000;
    const period2Start = 1702600000;
    const period2End = 1705200000;

    // Period 1
    const r1 = await creditDbSubscription(userId, 120, {
      periodStart: period1Start,
      periodEnd: period1End,
      stripeEventId: `evt_p1_${randomUUID().slice(0, 8)}`,
    });
    assert.equal(r1.credited, true);
    assert.equal(r1.balanceAfter, 120);

    // Period 2 (different period_start)
    const r2 = await creditDbSubscription(userId, 120, {
      periodStart: period2Start,
      periodEnd: period2End,
      stripeEventId: `evt_p2_${randomUUID().slice(0, 8)}`,
    });
    assert.equal(r2.credited, true);
    assert.equal(r2.balanceAfter, 240);

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 240);
  } finally {
    await cleanupUser(userId);
  }
});

// ── Top-Up Credit Tests ─────────────────────────────────────────────────────

test("creditDbTopup credits tokens correctly", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 50);
  try {
    const eventId = `evt_topup_${randomUUID().slice(0, 8)}`;
    const result = await creditDbTopup(userId, 30, { stripeEventId: eventId, note: "test topup" });
    assert.equal(result.success, true);
    assert.equal(result.balanceAfter, 80);

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 80);

    const history = await getTokenHistory(userId, { limit: 1 });
    assert.equal(history[0].tx_type, "topup");
    assert.equal(history[0].amount, 30);
    assert.equal(history[0].stripe_event_id, eventId);
  } finally {
    await cleanupUser(userId);
  }
});

test("creditDbTopup is idempotent — same stripe_event_id does not double-credit", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 0);
  try {
    const eventId = `evt_topup_dup_${randomUUID().slice(0, 8)}`;

    const r1 = await creditDbTopup(userId, 50, { stripeEventId: eventId });
    assert.equal(r1.success, true);
    assert.equal(r1.balanceAfter, 50);

    const r2 = await creditDbTopup(userId, 50, { stripeEventId: eventId });
    assert.equal(r2.success, true);
    // balanceAfter may be undefined on idempotent skip — that's fine

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 50); // Not 100
  } finally {
    await cleanupUser(userId);
  }
});

// ── Welcome Grant Tests ─────────────────────────────────────────────────────

test("grantDbWelcomeTokens grants on first call", async () => {
  const userId = testUserId();
  await seedUser(userId);
  try {
    const result = await grantDbWelcomeTokens(userId, 5);
    assert.equal(result.success, true);
    assert.equal(result.granted, true);
    assert.equal(result.balanceAfter, 5);

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 5);

    const history = await getTokenHistory(userId, { limit: 1 });
    assert.equal(history[0].tx_type, "welcome");
    assert.equal(history[0].amount, 5);
  } finally {
    await cleanupUser(userId);
  }
});

test("grantDbWelcomeTokens is idempotent — second call does not grant again", async () => {
  const userId = testUserId();
  await seedUser(userId);
  try {
    const r1 = await grantDbWelcomeTokens(userId, 5);
    assert.equal(r1.granted, true);

    const r2 = await grantDbWelcomeTokens(userId, 5);
    assert.equal(r2.success, true);
    assert.equal(r2.granted, false);

    const bal = await getDbBalance(userId);
    assert.equal(bal.balance, 5); // Not 10
  } finally {
    await cleanupUser(userId);
  }
});

// ── Full Lifecycle Test (Reserve → Refund → Credit) ─────────────────────────

test("full lifecycle: credit → reserve → refund → verify audit trail", async () => {
  const userId = testUserId();
  await seedUser(userId);
  try {
    // 1. Welcome grant
    await grantDbWelcomeTokens(userId, 10);

    // 2. Subscription credit
    await creditDbSubscription(userId, 120, {
      periodStart: 1700000000,
      periodEnd: 1702600000,
      stripeEventId: `evt_lifecycle_${randomUUID().slice(0, 8)}`,
    });

    // Balance should be 130
    let bal = await getDbBalance(userId);
    assert.equal(bal.balance, 130);

    // 3. Reserve (debit) for a job
    const jobId = randomUUID();
    const reserveResult = await reserveDbTokens(userId, 5, { jobId, note: "split job" });
    assert.equal(reserveResult.success, true);
    assert.equal(reserveResult.balanceAfter, 125);

    // 4. Job fails — refund
    const refundResult = await refundDbTokens(userId, 5, { jobId, note: "job failed" });
    assert.equal(refundResult.success, true);
    assert.equal(refundResult.balanceAfter, 130);

    // 5. Top-up purchase
    await creditDbTopup(userId, 30, { stripeEventId: `evt_topup_lc_${randomUUID().slice(0, 8)}` });

    // Final balance: 130 + 30 = 160
    bal = await getDbBalance(userId);
    assert.equal(bal.balance, 160);

    // 6. Verify full audit trail
    const history = await getTokenHistory(userId, { limit: 20 });
    assert.equal(history.length, 5);

    // Most recent first
    assert.equal(history[0].tx_type, "topup");
    assert.equal(history[0].amount, 30);
    assert.equal(history[0].balance_after, 160);

    assert.equal(history[1].tx_type, "refund");
    assert.equal(history[1].amount, 5);
    assert.equal(history[1].balance_after, 130);

    assert.equal(history[2].tx_type, "debit");
    assert.equal(history[2].amount, -5);
    assert.equal(history[2].balance_after, 125);

    assert.equal(history[3].tx_type, "subscription");
    assert.equal(history[3].amount, 120);
    assert.equal(history[3].balance_after, 130);

    assert.equal(history[4].tx_type, "welcome");
    assert.equal(history[4].amount, 10);
    assert.equal(history[4].balance_after, 10);
  } finally {
    await cleanupUser(userId);
  }
});

// ── Concurrency Safety Test ─────────────────────────────────────────────────

test("concurrent reserves do not overdraw (race condition prevention)", async () => {
  const userId = testUserId();
  await seedUserWithBalance(userId, 10);
  try {
    // Fire 5 concurrent reserve requests for 3 tokens each.
    // Only 3 should succeed (3 * 3 = 9 ≤ 10), the 4th and 5th should fail.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        reserveDbTokens(userId, 3, { note: `concurrent-${i}` }),
      ),
    );

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // At most 3 can succeed (3*3=9 ≤ 10; 4th would need 12 > 10)
    assert.ok(successes.length <= 3, `Expected ≤3 successes, got ${successes.length}`);
    assert.ok(failures.length >= 2, `Expected ≥2 failures, got ${failures.length}`);

    // Final balance should be non-negative
    const bal = await getDbBalance(userId);
    assert.ok(bal.balance >= 0, `Balance went negative: ${bal.balance}`);
    assert.equal(bal.balance, 10 - successes.length * 3);
  } finally {
    await cleanupUser(userId);
  }
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

test.after(async () => {
  const pool = getPool();
  if (pool) {
    await pool.end();
  }
});
