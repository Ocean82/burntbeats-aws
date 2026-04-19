import test from "node:test";
import assert from "node:assert/strict";

import express from "express";
import supertest from "supertest";
import { Webhook } from "svix";

import { clerkWebhookRouter } from "./clerkWebhook.js";

function buildApp() {
  const app = express();
  app.use("/api/clerk/webhook", express.raw({ type: "application/json" }));
  app.use("/api/clerk", clerkWebhookRouter);
  return app;
}

test("POST /api/clerk/webhook returns 503 when signing secret is missing", async () => {
  const prev = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  try {
    const app = buildApp();
    const res = await supertest(app)
      .post("/api/clerk/webhook")
      .set("content-type", "application/json")
      .send({ type: "user.created", data: { id: "user_test_1" } })
      .expect(503);
    assert.equal(res.body.error, "Clerk webhook not configured");
  } finally {
    if (prev === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = prev;
  }
});

const TEST_SVIX_SECRET = "whsec_dGVzdF9zZWNyZXRfMTIzNDU2Nzg5MA==";

test("POST /api/clerk/webhook rejects missing Svix headers", async () => {
  const prev = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = TEST_SVIX_SECRET;
  try {
    const app = buildApp();
    const res = await supertest(app)
      .post("/api/clerk/webhook")
      .set("content-type", "application/json")
      .send({ type: "user.created", data: { id: "user_test_2" } })
      .expect(400);
    assert.equal(res.body.error, "Missing Svix headers");
  } finally {
    if (prev === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = prev;
  }
});

test("POST /api/clerk/webhook accepts valid signed user.created payload", async () => {
  const prevSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  const prevWelcome = process.env.USAGE_SIGNUP_WELCOME_TOKENS;

  const signingSecret = TEST_SVIX_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = signingSecret;
  process.env.USAGE_SIGNUP_WELCOME_TOKENS = "0";

  try {
    const app = buildApp();
    const payload = JSON.stringify({ type: "user.created", data: { id: "user_test_3" } });
    const webhook = new Webhook(signingSecret);
    const msgId = "msg_test_1";
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    const signature = webhook.sign(msgId, now, payload);

    const res = await supertest(app)
      .post("/api/clerk/webhook")
      .set("content-type", "application/json")
      .set("svix-id", msgId)
      .set("svix-timestamp", timestamp)
      .set("svix-signature", signature)
      .send(payload)
      .expect(200);

    assert.equal(res.body.received, true);
  } finally {
    if (prevSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = prevSecret;
    if (prevWelcome === undefined) delete process.env.USAGE_SIGNUP_WELCOME_TOKENS;
    else process.env.USAGE_SIGNUP_WELCOME_TOKENS = prevWelcome;
  }
});
