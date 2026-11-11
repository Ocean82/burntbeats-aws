import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  normalizeRefundJobId,
  resolveRefundBucketFromDebitRow,
} from "../db-tokens.js";

test("resolveRefundBucketFromDebitRow identifies free monthly debits", () => {
  assert.equal(
    resolveRefundBucketFromDebitRow({
      tx_type: "free_monthly_debit",
      note: "free monthly allowance debit",
    }),
    "free_monthly",
  );

  assert.equal(
    resolveRefundBucketFromDebitRow({
      tx_type: "debit",
      note: "free monthly allowance debit (enum fallback)",
    }),
    "free_monthly",
  );

  assert.equal(
    resolveRefundBucketFromDebitRow({
      tx_type: "debit",
      note: "split/expand debit",
    }),
    "paid",
  );
});

test("normalizeRefundJobId accepts camelCase and status-route snake_case metadata", () => {
  const camelCaseJobId = randomUUID();
  const snakeCaseJobId = randomUUID();

  assert.equal(normalizeRefundJobId({ jobId: camelCaseJobId }), camelCaseJobId);
  assert.equal(normalizeRefundJobId({ job_id: snakeCaseJobId }), snakeCaseJobId);
  assert.equal(normalizeRefundJobId({ jobId: "", job_id: "" }), null);
});
