// @ts-check
import { randomBytes } from "crypto";
import { getPool } from "../db.js";
import { getClerkClient } from "../clerkAuth.js";
import { creditDbTopup } from "../db-tokens.js";

const REFERRAL_BONUS_TOKENS = Math.max(
  1,
  Math.floor(Number(process.env.REFERRAL_BONUS_TOKENS || 5)),
);

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
 * @returns {Promise<{ rewarded: boolean }>}
 */
export async function claimReferralRewards(refereeUserId) {
  const pool = getPool();
  if (!pool) return { rewarded: false };

  const reg = await pool.query(
    `SELECT referrer_user_id, reward_claimed
     FROM referral_registrations
     WHERE referee_user_id = $1`,
    [refereeUserId],
  );
  const row = reg.rows[0];
  if (!row || row.reward_claimed) return { rewarded: false };

  const referrerUserId = row.referrer_user_id;
  const refereeEventId = `referral_referee_${refereeUserId}`;
  const referrerEventId = `referral_referrer_${refereeUserId}`;

  await creditDbTopup(refereeUserId, REFERRAL_BONUS_TOKENS, {
    stripeEventId: refereeEventId,
    note: "referral bonus — first split",
  });
  await creditDbTopup(referrerUserId, REFERRAL_BONUS_TOKENS, {
    stripeEventId: referrerEventId,
    note: `referral bonus — invite completed (${refereeUserId.slice(0, 8)})`,
  });

  await pool.query(
    `UPDATE referral_registrations SET reward_claimed = TRUE WHERE referee_user_id = $1`,
    [refereeUserId],
  );

  return { rewarded: true };
}

/**
 * @param {string} clerkUserId
 * @returns {Promise<void>}
 */
export async function markFirstSplitComplete(clerkUserId) {
  const clerk = getClerkClient();
  if (!clerk) return;

  const user = await clerk.users.getUser(clerkUserId);
  const unsafe =
    user.unsafeMetadata && typeof user.unsafeMetadata === "object"
      ? { ...user.unsafeMetadata }
      : {};
  if (unsafe.firstSplitComplete === true) return;

  await clerk.users.updateUser(clerkUserId, {
    unsafeMetadata: {
      ...unsafe,
      firstSplitComplete: true,
      firstSplitCompletedAt: new Date().toISOString(),
    },
  });

  await claimReferralRewards(clerkUserId);
}

export { REFERRAL_BONUS_TOKENS };
