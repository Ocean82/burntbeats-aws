import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";

import express from "express";
import supertest from "supertest";

import { resolveStemJobPath } from "./shared.js";

async function createSourceInput(jobId) {
  const jobDir = resolveStemJobPath(jobId);
  if (!jobDir) throw new Error("Failed to resolve stem job directory");
  await mkdir(jobDir, { recursive: true });
  await writeFile(resolveStemJobPath(jobId, "input.wav"), Buffer.from("RIFFTEST"));
}

async function cleanupSourceInput(jobId) {
  const jobDir = resolveStemJobPath(jobId);
  if (jobDir) await rm(jobDir, { recursive: true, force: true });
}

async function buildRequest({ jobId, authenticatedUserId = "user_attacker" }) {
  const { serverExportRouter } = await import("./server-export.js");
  const app = express();
  app.use(express.json());
  app.locals.verifyClerkBearer = async () => authenticatedUserId;
  app.locals.getJobOwner = async (requestedJobId) =>
    requestedJobId === jobId ? "user_owner" : null;
  app.use("/api/stems/server-export", serverExportRouter);
  return supertest(app);
}

test("POST /api/stems/server-export rejects signed-in users who do not own the source job", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.SERVER_EXPORT_ENABLED;
  const previousRedisUrl = process.env.REDIS_URL;
  const previousStripeRedisUrl = process.env.STRIPE_WEBHOOK_REDIS_URL;
  process.env.NODE_ENV = "test";
  process.env.SERVER_EXPORT_ENABLED = "1";
  delete process.env.REDIS_URL;
  delete process.env.STRIPE_WEBHOOK_REDIS_URL;
  const jobId = randomUUID();
  await createSourceInput(jobId);

  try {
    const request = await buildRequest({ jobId });
    await request.post("/api/stems/server-export")
      .send({
        job_id: jobId,
        stem_ids: ["vocals"],
        stem_states: { vocals: { muted: false, soloed: false } },
      })
      .expect(403);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousEnabled === undefined) delete process.env.SERVER_EXPORT_ENABLED;
    else process.env.SERVER_EXPORT_ENABLED = previousEnabled;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
    if (previousStripeRedisUrl === undefined) delete process.env.STRIPE_WEBHOOK_REDIS_URL;
    else process.env.STRIPE_WEBHOOK_REDIS_URL = previousStripeRedisUrl;
    await cleanupSourceInput(jobId);
  }
});
