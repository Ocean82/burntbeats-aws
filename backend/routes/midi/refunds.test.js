// @ts-check
import test from "node:test";
import assert from "node:assert/strict";

import {
  finalizeMidiTerminalStatus,
  refundReservedMidiUsage,
} from "./refunds.js";

const JOB_ID = "22222222-2222-4222-8222-222222222222";

test("finalizeMidiTerminalStatus refunds the first failed paid MIDI transition", async () => {
  const transitions = [];
  const refunds = [];

  const transitioned = await finalizeMidiTerminalStatus({
    jobId: JOB_ID,
    status: "failed",
    errorMessage: "worker crashed",
    modelName: "basic-pitch",
    transitionToTerminal: async (jobId, status, extra) => {
      transitions.push({ jobId, status, extra });
      return {
        clerk_user_id: "user_midi_failed",
        token_cost: 2,
        is_sample: false,
      };
    },
    refundUsageTokens: async (userId, amount, meta) => {
      refunds.push({ userId, amount, meta });
    },
    logger: silentLogger,
  });

  assert.deepEqual(transitions, [
    {
      jobId: JOB_ID,
      status: "failed",
      extra: {
        errorMessage: "worker crashed",
        modelName: "basic-pitch",
      },
    },
  ]);
  assert.deepEqual(refunds, [
    {
      userId: "user_midi_failed",
      amount: 2,
      meta: { jobId: JOB_ID },
    },
  ]);
  assert.deepEqual(transitioned, {
    clerk_user_id: "user_midi_failed",
    token_cost: 2,
    is_sample: false,
  });
});

test("finalizeMidiTerminalStatus does not refund when the job was already terminal", async () => {
  const refunds = [];

  const transitioned = await finalizeMidiTerminalStatus({
    jobId: JOB_ID,
    status: "failed",
    transitionToTerminal: async () => null,
    refundUsageTokens: async (userId, amount, meta) => {
      refunds.push({ userId, amount, meta });
    },
    logger: silentLogger,
  });

  assert.equal(transitioned, null);
  assert.deepEqual(refunds, []);
});

test("refundReservedMidiUsage refunds accept-time service rejects after reservation", async () => {
  const refunds = [];

  const refunded = await refundReservedMidiUsage({
    usageReserved: true,
    usageUserId: "user_midi_rejected",
    usageCost: 1,
    refundUsageTokens: async (userId, amount, meta) => {
      refunds.push({ userId, amount, meta });
    },
    logger: silentLogger,
  });

  assert.equal(refunded, true);
  assert.deepEqual(refunds, [
    {
      userId: "user_midi_rejected",
      amount: 1,
      meta: undefined,
    },
  ]);
});

const silentLogger = {
  error() {},
};
