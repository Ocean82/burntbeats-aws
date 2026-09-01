import test from "node:test";
import assert from "node:assert/strict";

import {
  claimReferralRewards,
  markFirstSplitComplete,
} from "../referral/referralService.js";

function createPool(handler) {
  const queries = [];
  return {
    queries,
    async query(text, values = []) {
      queries.push({ text, values });
      return handler({ text, values, queries });
    },
  };
}

test("markFirstSplitComplete refuses a client-only milestone without a completed owned split", async () => {
  let didUpdateUser = false;
  let didCredit = false;
  const pool = createPool(({ text }) => {
    assert.match(text, /FROM jobs/);
    return { rows: [] };
  });
  const clerk = {
    users: {
      async getUser() {
        return { unsafeMetadata: { planPickerSeen: true } };
      },
      async updateUser() {
        didUpdateUser = true;
      },
    },
  };

  const result = await markFirstSplitComplete("user_referee", {
    pool,
    clerk,
    async creditTopup() {
      didCredit = true;
      return { success: true };
    },
  });

  assert.deepEqual(result, { completed: false, rewarded: false });
  assert.equal(didUpdateUser, false);
  assert.equal(didCredit, false);
  assert.equal(pool.queries.length, 1);
});

test("claimReferralRewards does not mark claimed when referee credit fails", async () => {
  let didMarkClaimed = false;
  const pool = createPool(({ text }) => {
    if (text.includes("SELECT referrer_user_id")) {
      return {
        rows: [{ referrer_user_id: "user_referrer", reward_claimed: false }],
      };
    }
    if (text.includes("UPDATE referral_registrations")) {
      didMarkClaimed = true;
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  });

  await assert.rejects(
    () =>
      claimReferralRewards("user_referee", {
        pool,
        async creditTopup() {
          return { success: false };
        },
      }),
    /** @param {unknown} err */
    (err) =>
      err instanceof Error &&
      "status" in err &&
      /** @type {{ status?: unknown }} */ (err).status === 503,
  );

  assert.equal(didMarkClaimed, false);
  assert.equal(pool.queries.length, 1);
});

test("claimReferralRewards marks claimed after both referral credits succeed", async () => {
  const events = [];
  const pool = createPool(({ text }) => {
    if (text.includes("SELECT referrer_user_id")) {
      events.push("select-registration");
      return {
        rows: [{ referrer_user_id: "user_referrer", reward_claimed: false }],
      };
    }
    if (text.includes("UPDATE referral_registrations")) {
      events.push("mark-claimed");
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  });

  const result = await claimReferralRewards("user_referee", {
    pool,
    async creditTopup(clerkUserId, grant, meta) {
      events.push(`credit:${clerkUserId}:${meta?.stripeEventId}:${grant}`);
      return { success: true };
    },
  });

  assert.deepEqual(result, { rewarded: true });
  assert.deepEqual(events, [
    "select-registration",
    "credit:user_referee:referral_referee_user_referee:5",
    "credit:user_referrer:referral_referrer_user_referee:5",
    "mark-claimed",
  ]);
});

test("markFirstSplitComplete preserves metadata after a verified first split", async () => {
  let updateParams = null;
  const pool = createPool(({ text }) => {
    if (text.includes("FROM jobs")) return { rows: [{ "?column?": 1 }] };
    if (text.includes("SELECT referrer_user_id")) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
  const clerk = {
    users: {
      async getUser() {
        return { unsafeMetadata: { planPickerSeen: true } };
      },
      async updateUser(_id, params) {
        updateParams = params;
      },
    },
  };

  const result = await markFirstSplitComplete("user_referee", { pool, clerk });

  assert.deepEqual(result, { completed: true, rewarded: false });
  assert.equal(updateParams?.unsafeMetadata.planPickerSeen, true);
  assert.equal(updateParams?.unsafeMetadata.firstSplitComplete, true);
  assert.equal(
    typeof updateParams?.unsafeMetadata.firstSplitCompletedAt,
    "string",
  );
});
