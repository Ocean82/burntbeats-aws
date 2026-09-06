import test from "node:test";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

import express from "express";
import supertest from "supertest";

import { previewRouter } from "./index.js";
import { resolveStemJobPath } from "../stems/shared.js";

const PREVIEW_DIR = path.resolve(os.tmpdir(), "burntbeats-previews");

async function createSourceInput(jobId) {
  const jobDir = resolveStemJobPath(jobId);
  if (!jobDir) throw new Error("Failed to resolve stem job directory");
  await mkdir(jobDir, { recursive: true });
  await writeFile(resolveStemJobPath(jobId, "input.wav"), Buffer.from("RIFFTEST"));
}

async function createCachedPreview(jobId) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  const previewId = `${jobId}_30_w`;
  await writeFile(
    path.join(PREVIEW_DIR, `meta_${previewId}.json`),
    JSON.stringify({
      preview_id: previewId,
      job_id: jobId,
      watermarked: true,
      duration_seconds: 30,
      file: `audio_${previewId}.mp3`,
    }),
  );
  await writeFile(path.join(PREVIEW_DIR, `audio_${previewId}.mp3`), Buffer.from("MP3"));
  return previewId;
}

async function cleanupJob(jobId) {
  const jobDir = resolveStemJobPath(jobId);
  if (jobDir) await rm(jobDir, { recursive: true, force: true });
  await rm(PREVIEW_DIR, { recursive: true, force: true });
}

function buildRequest({ jobId, authenticatedUserId = "user_attacker" }) {
  const app = express();
  app.use(express.json());
  app.locals.verifyClerkBearer = async () => authenticatedUserId;
  app.locals.getJobOwner = async (requestedJobId) =>
    requestedJobId === jobId ? "user_owner" : null;
  app.use("/api/preview", previewRouter);
  return supertest(app);
}

test("POST /api/preview/generate rejects signed-in users who do not own the source job", async () => {
  const jobId = randomUUID();
  await createSourceInput(jobId);

  try {
    await buildRequest({ jobId })
      .post("/api/preview/generate")
      .send({ job_id: jobId })
      .expect(403);
  } finally {
    await cleanupJob(jobId);
  }
});

test("GET /api/preview/:preview_id/download rejects signed-in users who do not own the cached preview job", async () => {
  const jobId = randomUUID();
  const previewId = await createCachedPreview(jobId);

  try {
    await buildRequest({ jobId })
      .get(`/api/preview/${previewId}/download`)
      .expect(403);
  } finally {
    await cleanupJob(jobId);
  }
});
