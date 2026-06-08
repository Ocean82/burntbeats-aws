import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";

import express from "express";
import supertest from "supertest";

import { stemHistoryRouter } from "./history.js";
import { resolveStemJobPath } from "./shared.js";

async function createLocalStem(jobId, stemName = "vocals") {
  const stemDir = resolveStemJobPath(jobId, "stems");
  if (!stemDir) throw new Error("Failed to resolve local stem directory");
  await mkdir(stemDir, { recursive: true });
  await writeFile(
    resolveStemJobPath(jobId, "stems", `${stemName}.wav`),
    Buffer.from("RIFFTEST"),
  );
}

async function createProgressWithS3(jobId, stemName = "vocals") {
  const jobDir = resolveStemJobPath(jobId);
  if (!jobDir) throw new Error("Failed to resolve job directory");
  await mkdir(jobDir, { recursive: true });
  await writeFile(
    resolveStemJobPath(jobId, "progress.json"),
    JSON.stringify({
      status: "completed",
      s3: {
        bucket: "test-bucket",
        region: "us-east-1",
        keys: {
          [stemName]: `stems/${jobId}/stems/${stemName}.wav`,
        },
      },
    }),
  );
}

async function cleanupJob(jobId) {
  const jobDir = resolveStemJobPath(jobId);
  if (jobDir) {
    await rm(jobDir, { recursive: true, force: true });
  }
}

function buildRequest(overrides = {}) {
  const app = express();
  app.locals.verifyClerkBearer =
    overrides.verifyClerkBearer || (async () => "user_test");
  app.locals.getJobHistoryWithStems = overrides.getJobHistoryWithStems;
  app.locals.getPool = overrides.getPool;
  app.use("/api/stems/history", stemHistoryRouter);
  return supertest(app);
}

test("GET /api/stems/history enriches disk-backed stems with availability and file_url", async () => {
  const jobId = randomUUID();
  await createLocalStem(jobId);

  try {
    const request = buildRequest({
      getJobHistoryWithStems: async () => ({
        total: 1,
        jobs: [
          {
            job_id: jobId,
            status: "completed",
            stems: 1,
            quality: "quality",
            original_filename: "track.wav",
            duration_seconds: 12,
            token_cost: 1,
            model_name: "test-model",
            created_at: "2026-06-01T00:00:00.000Z",
            completed_at: "2026-06-01T00:00:30.000Z",
            stem_files: [
              {
                stem_name: "vocals",
                s3_key: null,
                file_size_bytes: 8,
              },
            ],
          },
        ],
      }),
    });

    const res = await request.get("/api/stems/history").expect(200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.jobs[0].stem_files[0].available, true);
    assert.match(
      res.body.jobs[0].stem_files[0].file_url,
      new RegExp(`/api/stems/file/${jobId}/vocals\\.wav$`),
    );
  } finally {
    await cleanupJob(jobId);
  }
});

test("GET /api/stems/history marks progress-backed S3 stems available even when DB metadata is missing", async () => {
  const jobId = randomUUID();
  await createProgressWithS3(jobId);

  try {
    const request = buildRequest({
      getJobHistoryWithStems: async () => ({
        total: 1,
        jobs: [
          {
            job_id: jobId,
            status: "completed",
            stems: 1,
            quality: "quality",
            original_filename: "track.wav",
            duration_seconds: 12,
            token_cost: 1,
            model_name: "test-model",
            created_at: "2026-06-01T00:00:00.000Z",
            completed_at: "2026-06-01T00:00:30.000Z",
            stem_files: [
              {
                stem_name: "vocals",
                s3_key: null,
                file_size_bytes: 8,
              },
            ],
          },
        ],
      }),
    });

    const res = await request.get("/api/stems/history").expect(200);
    assert.equal(res.body.jobs[0].stem_files[0].available, true);
  } finally {
    await cleanupJob(jobId);
  }
});

test("GET /api/stems/history/download falls back to canonical file URL for disk-backed stems", async () => {
  const jobId = randomUUID();
  await createLocalStem(jobId);

  try {
    const request = buildRequest({
      getPool: () => ({
        query: async () => ({
          rows: [{ s3_key: null }],
        }),
      }),
    });

    const res = await request
      .get(`/api/stems/history/download?job_id=${jobId}&stem_name=vocals`)
      .expect(200);

    assert.match(
      res.body.url,
      new RegExp(`/api/stems/file/${jobId}/vocals\\.wav$`),
    );
  } finally {
    await cleanupJob(jobId);
  }
});
