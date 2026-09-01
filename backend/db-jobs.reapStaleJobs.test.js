import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "";

const { reapStaleJobs } = await import("./db-jobs.js");

test("reapStaleJobs refunds paid non-sample jobs that it marks failed", async () => {
  /** @type {{ sql: string, params: unknown[] } | null} */
  let queryCall = null;
  const refunded = [];
  const pool = {
    async query(sql, params) {
      queryCall = { sql, params };
      return {
        rowCount: 4,
        rows: [
          {
            job_id: "job-paid",
            clerk_user_id: "user_paid",
            token_cost: 7,
            is_sample: false,
          },
          {
            job_id: "job-sample",
            clerk_user_id: "user_sample",
            token_cost: 7,
            is_sample: true,
          },
          {
            job_id: "job-free",
            clerk_user_id: "user_free",
            token_cost: 0,
            is_sample: false,
          },
          {
            job_id: "job-anonymous",
            clerk_user_id: null,
            token_cost: 7,
            is_sample: false,
          },
        ],
      };
    },
  };

  const count = await reapStaleJobs({
    timeoutMinutes: 15,
    pool,
    refundUsageTokens: async (userId, amount, meta) => {
      refunded.push({ userId, amount, meta });
    },
  });

  assert.equal(count, 4);
  assert.match(queryCall?.sql ?? "", /status IN \('accepted', 'processing'\)/);
  assert.deepEqual(queryCall?.params, [
    "Job stalled — exceeded 15 minute timeout without completion. The stem service may have restarted or crashed during processing.",
    15,
  ]);
  assert.deepEqual(refunded, [
    {
      userId: "user_paid",
      amount: 7,
      meta: {
        jobId: "job-paid",
        reason: "stale_job_failed",
      },
    },
  ]);
});
