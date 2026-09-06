import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";

import express from "express";
import supertest from "supertest";

import { masterRouter } from "./index.js";
import { resolveStemJobPath } from "../stems/shared.js";

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

function buildRequest({ jobId, authenticatedUserId = "user_attacker" }) {
  const app = express();
  app.use(express.json());
  app.locals.verifyClerkBearer = async () => authenticatedUserId;
  app.locals.getJobOwner = async (requestedJobId) =>
    requestedJobId === jobId ? "user_owner" : null;
  app.use("/api/master", masterRouter);
  return supertest(app);
}

test("POST /api/master/render rejects signed-in users who do not own the source job", async () => {
  const jobId = randomUUID();
  await createSourceInput(jobId);

  try {
    await buildRequest({ jobId })
      .post("/api/master/render")
      .send({ job_id: jobId, preset_id: "rock_modern", source: "stem" })
      .expect(403);
  } finally {
    await cleanupSourceInput(jobId);
  }
});
