// @ts-check
/**
 * Usage tokens: balance in Clerk privateMetadata.usageTokens.
 * **1 token = 1 minute of audio** (partial minutes round up). Example: 5:00 → 5 tokens.
 *
 * **Charged (when USAGE_TOKENS_ENABLED):** POST /api/stems/split, POST /api/stems/expand;
 *   future POST /api/stems/server-export when implemented.
 * **Not charged:** GET status, GET stem files, mixing, editing, scrubbing, client-side master export.
 *
 * Enable with USAGE_TOKENS_ENABLED=1 (requires Clerk Bearer on metered routes when enabled).
 * See docs/BILLING-AND-TOKENS.md and docs/ARCHITECTURE-FLOW.md
 */
import { readdirSync } from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import { getClerkClient } from "./clerkAuth.js";
import { getRedis } from "./stripeRedis.js";

/** @returns {boolean} */
export function isUsageTokensEnabled() {
  return ["1", "true", "yes"].includes((process.env.USAGE_TOKENS_ENABLED || "").toLowerCase());
}

/** Dev bypass: debit checks always pass */
export function isUsageTokensDevUnlimited() {
  return ["1", "true", "yes"].includes((process.env.USAGE_TOKENS_DEV_UNLIMITED || "").toLowerCase());
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
 */
export function computeSplitCost(durationSec, _quality, _stems) {
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
 * Reserved for server-side master export (FFmpeg / mastering pipeline). Same minute basis as split/expand.
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
  const clerk = getClerkClient();
  if (!clerk) return { balance: 0, periodEnd: null };
  const user = await clerk.users.getUser(userId);
  const u = user.privateMetadata?.usageTokens;
  const rec = u && typeof u === "object" ? /** @type {Record<string, unknown>} */ (u) : {};
  const balance = Number(rec.balance);
  const periodEnd = rec.periodEnd != null ? Number(rec.periodEnd) : null;
  return {
    balance: Number.isFinite(balance) ? balance : 0,
    periodEnd: periodEnd != null && Number.isFinite(periodEnd) ? periodEnd : null,
  };
}

/**
 * @param {string} userId
 * @param {number} cost
 */
export async function assertSufficientBalance(userId, cost) {
  if (isUsageTokensDevUnlimited()) return;
  const { balance } = await getUsageBalance(userId);
  if (balance < cost) {
    const err = /** @type {Error & { status?: number }} */ (
      new Error(
        `Insufficient usage tokens (need ${cost}, have ${balance}). Upgrade your plan or wait for renewal.`,
      )
    );
    err.status = 402;
    throw err;
  }
}

/**
 * @param {string} userId
 * @param {number} cost
 */
export async function debitUsageTokens(userId, cost) {
  if (isUsageTokensDevUnlimited()) return;
  const clerk = getClerkClient();
  if (!clerk) return;
  const user = await clerk.users.getUser(userId);
  const prev = user.privateMetadata?.usageTokens;
  const rec = prev && typeof prev === "object" ? { .../** @type {Record<string, unknown>} */ (prev) } : {};
  const curBal = Number(rec.balance) || 0;
  const nextBal = Math.max(0, curBal - cost);
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
 * Idempotent monthly credit from Stripe subscription (same period not credited twice).
 * Uses optional Redis lock per (user, billing period) for multi-worker safety, plus
 * Clerk metadata for period + optional Stripe event id deduplication.
 *
 * @param {string} clerkUserId
 * @param {import("stripe").Stripe.Subscription} sub
 * @param {import("stripe").Stripe} stripe
 * @param {{ stripeEventId?: string }} [options]
 */
export async function creditSubscriptionAllowance(clerkUserId, sub, stripe, options = {}) {
  const stripeEventId = typeof options.stripeEventId === "string" ? options.stripeEventId : "";
  const clerk = getClerkClient();
  if (!clerk) return;

  const periodStart = sub.current_period_start;
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
      const last0 = r0 && typeof r0 === "object" ? r0.lastCreditedPeriodStart : undefined;
      if (last0 === periodStart) return;
      return;
    }
  }

  try {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec = prev && typeof prev === "object" ? { .../** @type {Record<string, unknown>} */ (prev) } : {};

    if (stripeEventId && typeof rec.processedStripeCreditEventIds === "object" && rec.processedStripeCreditEventIds !== null) {
      const ev = /** @type {Record<string, number>} */ (rec.processedStripeCreditEventIds);
      if (ev[stripeEventId]) return;
    }
    if (rec.lastCreditedPeriodStart === sub.current_period_start) {
      return;
    }
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    if (!priceId) return;
    const price = await stripe.prices.retrieve(priceId);
    const grant = tokensPerMonthFromPrice(price);
    const periodEndMs = sub.current_period_end ? sub.current_period_end * 1000 : null;
    const curBal = Number(rec.balance) || 0;

    /** @type {Record<string, number>} */
    let nextProcessed = {};
    if (typeof rec.processedStripeCreditEventIds === "object" && rec.processedStripeCreditEventIds !== null) {
      nextProcessed = { .../** @type {Record<string, number>} */ (rec.processedStripeCreditEventIds) };
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
          lastCreditedPeriodStart: sub.current_period_start,
          lastCreditAt: Date.now(),
          lastCreditAmount: grant,
          ...(stripeEventId ? { processedStripeCreditEventIds: nextProcessed } : {}),
        },
      },
    });
    console.log(`[usageTokens] credited ${grant} tokens user=${clerkUserId} period=${sub.current_period_start}`);
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
  if (meta?.token_seconds_per_month != null && meta.token_seconds_per_month !== "") {
    const sec = Number(meta.token_seconds_per_month);
    if (Number.isFinite(sec) && sec > 0) return Math.max(1, Math.ceil(sec / 60));
  }
  const def = Number(process.env.USAGE_DEFAULT_TOKENS_PER_MONTH);
  return Number.isFinite(def) && def > 0 ? Math.floor(def) : 6000;
}
