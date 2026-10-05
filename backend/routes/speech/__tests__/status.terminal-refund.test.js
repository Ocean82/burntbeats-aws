// @ts-check
import test from "node:test";
import assert from "node:assert/strict";

import { reconcileSpeechTerminalStatus } from "../status.js";

test("reconcileSpeechTerminalStatus refunds paid speech jobs on first failed terminal transition", async () => {
  const transitionCalls = [];
  const refundCalls = [];

  await reconcileSpeechTerminalStatus({
    jobId: "11111111-1111-4111-8111-111111111111",
    statusData: {
      status: "failed",
      error: "worker crashed",
      model: "speech-enhancer",
    },
    transitionJobToTerminal: async (...args) => {
      transitionCalls.push(args);
      return {
        clerk_user_id: "user_speech_paid",
        token_cost: 4,
        is_sample: false,
      };
    },
    refundTokens: async (...args) => {
      refundCalls.push(args);
    },
  });

  assert.equal(transitionCalls.length, 1);
  assert.deepEqual(transitionCalls[0], [
    "11111111-1111-4111-8111-111111111111",
    "failed",
    {
      errorMessage: "worker crashed",
      modelName: "speech-enhancer",
    },
  ]);
  assert.deepEqual(refundCalls, [
    [
      "user_speech_paid",
      4,
      {
        jobId: "11111111-1111-4111-8111-111111111111",
      },
    ],
  ]);
});

test("reconcileSpeechTerminalStatus does not refund repeated terminal polls", async () => {
  const refundCalls = [];

  await reconcileSpeechTerminalStatus({
    jobId: "22222222-2222-4222-8222-222222222222",
    statusData: {
      status: "cancelled",
      error: "cancelled by worker",
    },
    transitionJobToTerminal: async () => null,
    refundTokens: async (...args) => {
      refundCalls.push(args);
    },
  });

  assert.deepEqual(refundCalls, []);
});

test("reconcileSpeechTerminalStatus records completed speech jobs without refunding", async () => {
  const refundCalls = [];

  await reconcileSpeechTerminalStatus({
    jobId: "33333333-3333-4333-8333-333333333333",
    statusData: {
      status: "completed",
    },
    transitionJobToTerminal: async () => ({
      clerk_user_id: "user_speech_paid",
      token_cost: 4,
      is_sample: false,
    }),
    refundTokens: async (...args) => {
      refundCalls.push(args);
    },
  });

  assert.deepEqual(refundCalls, []);
});
