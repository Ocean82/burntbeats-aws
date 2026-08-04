// @ts-check
import { randomBytes } from "crypto";
import { getPool } from "../db.js";
import { getClerkClient } from "../clerkAuth.js";
import { creditDbTopup } from "../db-tokens.js";

/**
 * @typedef {{ rows: Array<Record<string, unknown>> }} QueryResult
 * @typedef {{ query: (text: string, values?: unknown[]) => Promise<QueryResult> }} ReferralPool
 * @typedef {{ success: boolean }} CreditResult
 * @typedef {(clerkUserId: string, grant: number, meta?: { stripeEventId?: string, note?: string }) => Promise<CreditResult>} CreditTopup
 * @typedef {{ unsafeMetadata?: unknown }} ClerkUser
 * @typedef {{ users: {
 *   getUser: (id: string) => Promise<ClerkUser>,
 *   updateUser: (id: string, params: { unsafeMetadata: Record<string, unknown> }) => Promise<unknown>
 * } }} ClerkClientLike
 */

const REFERRAL_BONUS_TOKENS = Math.max(
  1,
  Math.floor(Number(process.env.REFERRAL_BONUS_TOKENS || 5)),
);

/**
 * @param {string} message
 * @returns {Error & { status: number }}
 */
function referralCreditError(message) {
  return Object.assign(new Error(message), { status: 503 });
}

/**
 * @param {string} clerkUserId
 * @returns {Promise<string | null>}
 */
async function generateUniqueCode(clerkUserId) {
  const pool = getPool();
  if (!pool) return null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    try {
      await pool.query(
        `INSERT INTO referral_codes (clerk_user_id, code) VALUES ($1, $2)
         ON CONFLICT (clerk_user_id) DO NOTHING`,
        [clerkUserId, code],
      );
      const res = await pool.query(
        `SELECT code FROM referral_codes WHERE clerk_user_id = $1`,
        [clerkUserId],
      );
      if (res.rows[0]?.code) return res.rows[0].code;
    } catch {
      // collision — retry
    }
  }
  return null;
}

/**
 * @param {string} clerkUserId
 * @returns {Promise<{ code: string, inviteCount: number, tokensEarned: number } | null>}
 */
export async function getReferralProfile(clerkUserId) {
  const pool = getPool();
  if (!pool) return null;

  await pool.query(
    `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
    [clerkUserId],
  );

  let code = await generateUniqueCode(clerkUserId);
  if (!code) {
    const existing = await pool.query(
      `SELECT code FROM referral_codes WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
    code = existing.rows[0]?.code ?? null;
  }
  if (!code) return null;

  const stats = await pool.query(
    `SELECT
       COUNT(*)::int AS invite_count,
       COUNT(*) FILTER (WHERE reward_claimed)::int AS rewarded_count
     FROM referral_registrations
     WHERE referrer_user_id = $1`,
    [clerkUserId],
  );
  const inviteCount = stats.rows[0]?.invite_count ?? 0;
  const rewardedCount = stats.rows[0]?.rewarded_count ?? 0;

  return {
    code,
    inviteCount,
    tokensEarned: rewardedCount * REFERRAL_BONUS_TOKENS,
  };
}

/**
 * @param {string} refereeUserId
 * @param {string} code
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function attachReferralCode(refereeUserId, code) {
  const pool = getPool();
  if (!pool) return { ok: false, error: "Referrals unavailable" };

  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalized || normalized.length < 4) {
    return { ok: false, error: "Invalid referral code" };
  }

  await pool.query(
    `INSERT INTO users (clerk_user_id) VALUES ($1) ON CONFLICT (clerk_user_id) DO NOTHING`,
    [refereeUserId],
  );

  const existing = await pool.query(
    `SELECT referee_user_id FROM referral_registrations WHERE referee_user_id = $1`,
    [refereeUserId],
  );
  if (existing.rows.length > 0) {
    return { ok: true };
  }

  const referrer = await pool.query(
    `SELECT clerk_user_id FROM referral_codes WHERE code = $1`,
    [normalized],
  );
  const referrerUserId = referrer.rows[0]?.clerk_user_id;
  if (!referrerUserId) {
    return { ok: false, error: "Referral code not found" };
  }
  if (referrerUserId === refereeUserId) {
    return { ok: false, error: "You cannot use your own referral code" };
  }

  await pool.query(
    `INSERT INTO referral_registrations (referee_user_id, referrer_user_id)
     VALUES ($1, $2)`,
    [refereeUserId, referrerUserId],
  );

  return { ok: true };
}

/**
 * @param {string} refereeUserId
 * @param {{ pool?: ReferralPool | null, creditTopup?: CreditTopup }} [deps]
 * @returns {Promise<{ rewarded: boolean }>}
 */
export async function claimReferralRewards(refereeUserId, deps = {}) {
  const pool = deps.pool === undefined ? getPool() : deps.pool;
  if (!pool) return { rewarded: false };
  const creditTopup = deps.creditTopup || creditDbTopup;

  const reg = await pool.query(
    `SELECT referrer_user_id, reward_claimed
     FROM referral_registrations
     WHERE referee_user_id = $1`,
    [refereeUserId],
  );
  const row = reg.rows[0];
  if (!row || row.reward_claimed) return { rewarded: false };

  const referrerUserId =
    typeof row.referrer_user_id === "string" ? row.referrer_user_id : "";
  if (!referrerUserId) return { rewarded: false };
  const refereeEventId = `referral_referee_${refereeUserId}`;
  const referrerEventId = `referral_referrer_${refereeUserId}`;

  const refereeCredit = await creditTopup(refereeUserId, REFERRAL_BONUS_TOKENS, {
    stripeEventId: refereeEventId,
    note: "referral bonus — first split",
  });
  if (!refereeCredit.success) {
    throw referralCreditError("Unable to credit referee referral bonus");
  }

  const referrerCredit = await creditTopup(referrerUserId, REFERRAL_BONUS_TOKENS, {
    stripeEventId: referrerEventId,
    note: `referral bonus — invite completed (${refereeUserId.slice(0, 8)})`,
  });
  if (!referrerCredit.success) {
    throw referralCreditError("Unable to credit referrer referral bonus");
  }

  await pool.query(
    `UPDATE referral_registrations SET reward_claimed = TRUE WHERE referee_user_id = $1`,
    [refereeUserId],
  );

  return { rewarded: true };
}

/**
 * @param {string} clerkUserId
 * @param {{ pool?: ReferralPool | null }} [deps]
 * @returns {Promise<boolean>}
 */
export async function hasCompletedFirstSplit(clerkUserId, deps = {}) {
  const pool = deps.pool === undefined ? getPool() : deps.pool;
  if (!pool) return false;

  const completed = await pool.query(
    `SELECT 1
     FROM jobs
     WHERE clerk_user_id = $1
       AND status = 'completed'
       AND is_sample = FALSE
     LIMIT 1`,
    [clerkUserId],
  );
  return completed.rows.length > 0;
}

/**
 * @param {string} clerkUserId
 * @param {{ pool?: ReferralPool | null, clerk?: ClerkClientLike | null, creditTopup?: CreditTopup }} [deps]
 * @returns {Promise<{ completed: boolean, rewarded: boolean }>}
 */
export async function markFirstSplitComplete(clerkUserId, deps = {}) {
  const clerk =
    deps.clerk === undefined
      ? /** @type {ClerkClientLike | null} */ (getClerkClient())
      : deps.clerk;
  if (!clerk) return { completed: false, rewarded: false };

  const user = await clerk.users.getUser(clerkUserId);
  const unsafe =
    user.unsafeMetadata && typeof user.unsafeMetadata === "object"
      ? { ...user.unsafeMetadata }
      : {};
  if (unsafe.firstSplitComplete === true) {
    return { completed: true, rewarded: false };
  }

  const pool = deps.pool === undefined ? getPool() : deps.pool;
  const hasCompletedSplit = await hasCompletedFirstSplit(clerkUserId, { pool });
  if (!hasCompletedSplit) return { completed: false, rewarded: false };

  const rewardResult = await claimReferralRewards(clerkUserId, {
    pool,
    creditTopup: deps.creditTopup,
  });

  await clerk.users.updateUser(clerkUserId, {
    unsafeMetadata: {
      ...unsafe,
      firstSplitComplete: true,
      firstSplitCompletedAt: new Date().toISOString(),
    },
  });

  return { completed: true, rewarded: rewardResult.rewarded };
}

export { REFERRAL_BONUS_TOKENS };
