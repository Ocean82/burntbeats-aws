// @ts-check
/**
 * Usage tokens: balance in Clerk privateMetadata.usageTokens.
 * **1 token = 1 minute of audio** (partial minutes round up). Example: 5:00 → 5 tokens.
 *
 * **Charged (when USAGE_TOKENS_ENABLED):** POST /api/stems/split; POST /api/stems/expand;
 *   POST /api/stems/server-export when **SERVER_EXPORT_ENABLED** (minute basis via `computeServerExportCost`; handler in `backend/server.js`).
 * **Not charged:** GET status; GET stem files; mixer edits / scrubbing; client-side master export (**WAV** / **MP3** / **ZIP** assembly).
 *
 * Enable with USAGE_TOKENS_ENABLED=1 (requires Clerk Bearer on metered routes when enabled).
 * See docs/BILLING-AND-TOKENS.md and docs/ARCHITECTURE-FLOW.md
 */
import { readdirSync } from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import { getClerkClient } from "./clerkAuth.js";
import { getRedis } from "./stripeRedis.js";
import { isDbTokensAvailable, reserveDbTokens, refundDbTokens, getDbBalance, creditDbSubscription, creditDbTopup, grantDbWelcomeTokens } from "./db-tokens.js";

/**
 * Distributed lock for per-user token operations.
 * Uses Redis NX lock when available; falls back to a no-op for single-instance deployments.
 * Prevents race conditions when concurrent requests debit/credit the same user's balance.
 * @param {string} userId
 * @param {() => Promise<void>} fn
 */
async function withUserUsageLock(userId, fn) {
  const redis = await getRedis();
  if (!redis) {
    // Single-instance: no distributed lock needed, run directly.
    return fn();
  }
  const lockKey = `usage:lock:${userId}`;
  const got = await redis.set(lockKey, "1", { NX: true, EX: 30 });
  if (!got) {
    throw Object.assign(
      new Error(
        "Another request is already in progress for this account. Please retry.",
      ),
      { status: 429 },
    );
  }
  try {
    return await fn();
  } finally {
    await redis.del(lockKey).catch(() => {
      /* best-effort */
    });
  }
}

/** @returns {boolean} */
export function isUsageTokensEnabled() {
  return ["1", "true", "yes"].includes(
    (process.env.USAGE_TOKENS_ENABLED || "").toLowerCase(),
  );
}

/** Dev bypass: debit checks always pass */
function isUsageTokensDevUnlimited() {
  return ["1", "true", "yes"].includes(
    (process.env.USAGE_TOKENS_DEV_UNLIMITED || "").toLowerCase(),
  );
}

/**
 * Tokens from duration: one token per started minute (ceil), minimum 1 token per job.
 * @param {number} durationSec
 */
export function computeTokensFromDurationSeconds(durationSec) {
  const d = Math.max(0, durationSec);
  return Math.max(1, Math.ceil(d / 60));
}

/**
 * @param {number} durationSec
 * @param {string|undefined} _quality
 * @param {string|undefined} _stems
 * @param {boolean} [isSample]
 */
export function computeSplitCost(durationSec, _quality, _stems, isSample) {
  if (isSample && isSampleModeEnabled() && durationSec <= 60) {
    return 0;
  }
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * @param {number} durationSec
 * @param {string|undefined} _quality
 */
export function computeExpandCost(durationSec, _quality) {
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * **`POST /api/stems/server-export`** when **`SERVER_EXPORT_ENABLED`** — offline render in **`stem_service/server_export.py`** (SciPy DSP chain), not metering for client-only export paths.
 * Same minute basis as split/expand (`computeTokensFromDurationSeconds`).
 * @param {number} durationSec
 */
export function computeServerExportCost(durationSec) {
  return computeTokensFromDurationSeconds(durationSec);
}

/**
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds (from container; may be fractional)
 */
export async function getAudioDurationSeconds(filePath) {
  const meta = await parseFile(filePath);
  const d = meta.format.duration;
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) {
    throw new Error("Could not read audio duration from file");
  }
  return d;
}

/**
 * @param {string} jobDir absolute path to job folder (contains input.*)
 * @returns {string | null}
 */
export function findJobInputPath(jobDir) {
  try {
    const names = readdirSync(jobDir);
    const input = names.find((n) => n.startsWith("input."));
    return input ? path.join(jobDir, input) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} userId
 * @returns {Promise<{ balance: number, periodEnd: number | null }>}
 */
export async function getUsageBalance(userId) {
  // Prefer DB when available
  if (isDbTokensAvailable()) {
    const dbResult = await getDbBalance(userId);
    if (dbResult !== null) {
      const periodEndMs = dbResult.periodEnd ? dbResult.periodEnd.getTime() : null;
      return { balance: dbResult.balance, periodEnd: periodEndMs };
    }
  }
  // Fallback to Clerk metadata
  const clerk = getClerkClient();
  if (!clerk) return { balance: 0, periodEnd: null };
  const user = await clerk.users.getUser(userId);
  const u = user.privateMetadata?.usageTokens;
  const rec =
    u && typeof u === "object"
      ? /** @type {Record<string, unknown>} */ (u)
      : {};
  const balance = Number(rec.balance);
  const periodEnd = rec.periodEnd != null ? Number(rec.periodEnd) : null;
  return {
    balance: Number.isFinite(balance) ? balance : 0,
    periodEnd:
      periodEnd != null && Number.isFinite(periodEnd) ? periodEnd : null,
  };
}

/**
 * @param {string} userId
 * @param {number} cost
 * @param {{ jobId?: string }} [meta]
 */
export async function reserveUsageTokens(userId, cost, meta = {}) {
  if (isUsageTokensDevUnlimited()) return;
  if (!Number.isFinite(cost) || cost <= 0) return;

  // Primary: DB-backed debit (transactional, with ledger)
  if (isDbTokensAvailable()) {
    const result = await reserveDbTokens(userId, cost, { jobId: meta.jobId, note: "split/expand debit" });
    if (!result.success) {
      const err = /** @type {Error & { status?: number }} */ (
        new Error(result.error || "Token reservation failed")
      );
      err.status = result.error?.includes("Insufficient") ? 402 : 500;
      throw err;
    }
    // Also update Clerk metadata as a cache (best-effort, don't fail if this errors)
    try {
      await _updateClerkBalanceCache(userId, result.balanceAfter ?? 0);
    } catch (e) {
      console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    return;
  }

  // Fallback: Clerk-only (original behaviour)
  const clerk = getClerkClient();
  if (!clerk) return;

  await withUserUsageLock(userId, async () => {
    const user = await clerk.users.getUser(userId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    if (curBal < cost) {
      const err = /** @type {Error & { status?: number }} */ (
        new Error(
          `Insufficient usage tokens (need ${cost}, have ${curBal}). Upgrade your plan or wait for renewal.`,
        )
      );
      err.status = 402;
      throw err;
    }
    const nextBal = curBal - cost;
    await clerk.users.updateUserMetadata(userId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: nextBal,
          lastDebitAt: Date.now(),
          lastDebitAmount: cost,
        },
      },
    });
  });
}

/**
 * Refund previously reserved tokens (best-effort compensating action).
 * @param {string} userId
 * @param {number} amount
 * @param {{ jobId?: string }} [meta]
 */
export async function refundUsageTokens(userId, amount, meta = {}) {
  if (isUsageTokensDevUnlimited()) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  // Primary: DB refund
  if (isDbTokensAvailable()) {
    const result = await refundDbTokens(userId, amount, { jobId: meta.jobId, note: "job refund" });
    if (result.success && result.balanceAfter != null) {
      try {
        await _updateClerkBalanceCache(userId, result.balanceAfter);
      } catch (e) {
        console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
      }
    }
    return;
  }

  // Fallback: Clerk-only
  const clerk = getClerkClient();
  if (!clerk) return;
  await withUserUsageLock(userId, async () => {
    const user = await clerk.users.getUser(userId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    await clerk.users.updateUserMetadata(userId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + amount,
          lastRefundAt: Date.now(),
          lastRefundAmount: amount,
        },
      },
    });
  });
}

/**
 * Best-effort update of Clerk privateMetadata balance cache.
 * This keeps the Clerk-based billing/usage endpoint fast without a DB query.
 * @param {string} userId
 * @param {number} newBalance
 */
async function _updateClerkBalanceCache(userId, newBalance) {
  const clerk = getClerkClient();
  if (!clerk) return;
  const user = await clerk.users.getUser(userId);
  const prev = user.privateMetadata?.usageTokens;
  const rec =
    prev && typeof prev === "object"
      ? { .../** @type {Record<string, unknown>} */ (prev) }
      : {};
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: {
      .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
      usageTokens: {
        ...rec,
        balance: newBalance,
      },
    },
  });
}

/**
 * Prune processedStripeCreditEventIds to max ~40 entries (oldest by timestamp).
 * @param {Record<string, number>} m
 */
function pruneProcessedCreditEvents(m) {
  const keys = Object.keys(m);
  if (keys.length <= 40) return m;
  keys.sort((a, b) => (m[a] || 0) - (m[b] || 0));
  const next = { ...m };
  for (const k of keys.slice(0, keys.length - 40)) delete next[k];
  return next;
}

/**
 * Current billing period from a Stripe Subscription.
 * Newer Stripe API shapes expose `current_period_*` on subscription items, not the parent object.
 * @param {import("stripe").Stripe.Subscription} sub
 */
export function subscriptionBillingPeriod(sub) {
  const s = /** @type {any} */ (sub);
  const item0 = s.items?.data?.[0];
  const start = s.current_period_start ?? item0?.current_period_start;
  const end = s.current_period_end ?? item0?.current_period_end;
  return { periodStart: start, periodEnd: end };
}

/**
 * Idempotent monthly credit from Stripe subscription (same period not credited twice).
 * Uses optional Redis lock per (user, billing period) for multi-worker safety, plus
 * Clerk metadata for period + optional Stripe event id deduplication.
 *
 * @param {string} clerkUserId
 * @param {import("stripe").Stripe.Subscription} sub
 * @param {import("stripe").Stripe} stripe
 * @param {{ stripeEventId?: string }} [options]
 */
export async function creditSubscriptionAllowance(
  clerkUserId,
  sub,
  stripe,
  options = {},
) {
  const stripeEventId =
    typeof options.stripeEventId === "string" ? options.stripeEventId : "";
  const clerk = getClerkClient();
  if (!clerk) return;

  const { periodStart, periodEnd } = subscriptionBillingPeriod(sub);
  const redis = await getRedis();
  /** @type {string | null} */
  let lockKey = null;

  if (redis && periodStart != null && typeof periodStart === "number") {
    lockKey = `stripe:credit_lock:${clerkUserId}:${periodStart}`;
    const got = await redis.set(lockKey, "1", { NX: true, EX: 120 });
    if (!got) {
      await new Promise((r) => setTimeout(r, 200));
      const u0 = await clerk.users.getUser(clerkUserId);
      const r0 = u0.privateMetadata?.usageTokens;
      const rec0 =
        r0 && typeof r0 === "object"
          ? /** @type {Record<string, unknown>} */ (r0)
          : {};
      if (rec0.lastCreditedPeriodStart === periodStart) return;
      return;
    }
  }

  try {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};

    if (
      stripeEventId &&
      typeof rec.processedStripeCreditEventIds === "object" &&
      rec.processedStripeCreditEventIds !== null
    ) {
      const ev = /** @type {Record<string, number>} */ (
        rec.processedStripeCreditEventIds
      );
      if (ev[stripeEventId]) return;
    }
    if (rec.lastCreditedPeriodStart === periodStart) {
      return;
    }
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    if (!priceId) return;
    const price = await stripe.prices.retrieve(priceId);
    const grant = tokensPerMonthFromPrice(price);
    const periodEndMs =
      periodEnd != null && typeof periodEnd === "number"
        ? periodEnd * 1000
        : null;
    const curBal = Number(rec.balance) || 0;

    /** @type {Record<string, number>} */
    let nextProcessed = {};
    if (
      typeof rec.processedStripeCreditEventIds === "object" &&
      rec.processedStripeCreditEventIds !== null
    ) {
      nextProcessed = {
        .../** @type {Record<string, number>} */ (
          rec.processedStripeCreditEventIds
        ),
      };
    }
    if (stripeEventId) {
      nextProcessed[stripeEventId] = Date.now();
      nextProcessed = pruneProcessedCreditEvents(nextProcessed);
    }

    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + grant,
          periodEnd: periodEndMs,
          lastCreditedPeriodStart: periodStart,
          lastCreditAt: Date.now(),
          lastCreditAmount: grant,
          ...(stripeEventId
            ? { processedStripeCreditEventIds: nextProcessed }
            : {}),
        },
      },
    });

    // Also write to DB (primary ledger when available)
    if (isDbTokensAvailable()) {
      await creditDbSubscription(clerkUserId, grant, {
        periodStart: typeof periodStart === "number" ? periodStart : undefined,
        periodEnd: typeof periodEnd === "number" ? periodEnd : undefined,
        stripeEventId: stripeEventId || undefined,
      });
    }

    console.log(
      `[usageTokens] credited ${grant} tokens user=${clerkUserId} period=${periodStart}`,
    );
  } finally {
    if (redis && lockKey) {
      try {
        await redis.del(lockKey);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Monthly grant in the same units as debit: **1 token = 1 minute of audio**.
 * @param {import("stripe").Stripe.Price} price
 */
export function tokensPerMonthFromPrice(price) {
  const meta = price?.metadata;
  if (meta?.tokens_per_month != null && meta.tokens_per_month !== "") {
    const n = Number(meta.tokens_per_month);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  // Fallback: legacy key used before tokens_per_month was standardised
  if (meta?.token_allowance != null && meta.token_allowance !== "") {
    const n = Number(meta.token_allowance);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  if (
    meta?.token_seconds_per_month != null &&
    meta.token_seconds_per_month !== ""
  ) {
    const sec = Number(meta.token_seconds_per_month);
    if (Number.isFinite(sec) && sec > 0)
      return Math.max(1, Math.ceil(sec / 60));
  }
  const def = Number(process.env.USAGE_DEFAULT_TOKENS_PER_MONTH);
  return Number.isFinite(def) && def > 0 ? Math.floor(def) : 0;
}

/**
 * One-time top-up grant from Stripe Price metadata.
 * Accepts dedicated top-up key first, then monthly key as fallback.
 * @param {import("stripe").Stripe.Price} price
 */
export function tokensPerTopupFromPrice(price) {
  const meta = price?.metadata;
  // Accept both plural (preferred) and singular (legacy Stripe metadata key)
  for (const key of ["tokens_per_topup", "token_per_topup"]) {
    if (meta?.[key] != null && meta[key] !== "") {
      const n = Number(meta[key]);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  }
  for (const key of ["token_seconds_per_topup", "token_second_per_topup"]) {
    if (meta?.[key] != null && meta[key] !== "") {
      const sec = Number(meta[key]);
      if (Number.isFinite(sec) && sec > 0)
        return Math.max(1, Math.ceil(sec / 60));
    }
  }
  // Backwards-compatible fallback for teams using a shared metadata key.
  return tokensPerMonthFromPrice(price);
}

/**
 * Credit one-time purchased tokens.
 * @param {string} clerkUserId
 * @param {number} grant
 */
export async function creditTopupTokens(clerkUserId, grant) {
  if (!Number.isFinite(grant) || grant <= 0) return;

  // Primary: DB
  if (isDbTokensAvailable()) {
    await creditDbTopup(clerkUserId, grant);
  }

  // Secondary: Clerk metadata cache
  const clerk = getClerkClient();
  if (!clerk) return;
  await withUserUsageLock(clerkUserId, async () => {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + grant,
          lastTopupAt: Date.now(),
          lastTopupAmount: grant,
        },
      },
    });
  });
}

/**
 * One-time welcome grant for brand-new accounts.
 * Protected by the same per-user lock used for debit/credit operations.
 * @param {string} clerkUserId
 * @param {number} grant
 * @returns {Promise<{ granted: boolean, balance: number }>}
 */
export async function grantWelcomeSignupTokens(clerkUserId, grant) {
  // Ensure we always grant at least 1 token even if env is missing,
  // but allow explicit 0 if that's what's intended.
  const amount = Number.isFinite(grant) ? Math.floor(grant) : 1;

  // Primary: DB (idempotent)
  if (isDbTokensAvailable()) {
    const dbResult = await grantDbWelcomeTokens(clerkUserId, amount);
    if (dbResult.success) {
      // Also update Clerk cache
      try {
        await _updateClerkBalanceCache(clerkUserId, dbResult.balanceAfter ?? 0);
      } catch (e) {
        console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
      }
      return { granted: dbResult.granted, balance: dbResult.balanceAfter ?? 0 };
    }
    // Fall through to Clerk-only if DB failed
  }

  // Fallback: Clerk-only
  const clerk = getClerkClient();
  if (!clerk) return { granted: false, balance: 0 };

  /** @type {{ granted: boolean, balance: number }} */
  let result = { granted: false, balance: 0 };
  await withUserUsageLock(clerkUserId, async () => {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    if (rec.welcomeGrantAppliedAt) {
      result = { granted: false, balance: curBal };
      return;
    }
    const now = Date.now();
    const nextBal = curBal + amount;
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: nextBal,
          welcomeGrantAppliedAt: now,
          welcomeGrantAmount: amount,
          lastTopupAt: now,
          lastTopupAmount: amount,
        },
      },
    });
    result = { granted: true, balance: nextBal };
  });
  return result;
}

/**
 * Check if sample mode is enabled.
 * Sample mode allows free 30-60 second splits without consuming tokens.
 * @returns {boolean}
 */
export function isSampleModeEnabled() {
  return ["1", "true", "yes"].includes(
    (process.env.SAMPLE_MODE_ENABLED || "").toLowerCase(),
  );
}

/**
 * Calculate token cost for sample mode.
 * Always returns 0 tokens for durations up to 60 seconds.
 * @param {number} durationSec
 * @returns {number}
 */
export function calculateSampleModeCost(durationSec) {
  if (isSampleModeEnabled() && durationSec <= 60) {
    return 0; // Free for up to 60 seconds
  }
  return Math.max(1, Math.ceil(durationSec / 60));
}
