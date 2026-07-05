import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.JOB_TOKEN_TTL_MS = "3600000";

const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DUMMY_STEM_BYTES = Buffer.from("RIFF....WAVEfmt ");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-contract-stem-status-"));
const stemOutputDir = path.join(tempRoot, "stems");
const stemDir = path.join(stemOutputDir, JOB_ID, "stems");
fs.mkdirSync(stemDir, { recursive: true });
fs.writeFileSync(path.join(stemDir, "vocals.wav"), DUMMY_STEM_BYTES);
fs.writeFileSync(
  path.join(stemOutputDir, JOB_ID, "progress.json"),
  JSON.stringify({
    status: "completed",
    progress: 100,
    stems: [{ id: "vocals", path: "stems/vocals.wav" }],
  }),
  "utf-8",
);
process.env.STEM_OUTPUT_DIR = stemOutputDir;

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");

const jobToken = issueJobToken(JOB_ID);
const request = supertest(app);

test("GET /api/stems/status/:job_id returns JobStatusResponse shape", async () => {
  const res = await request
    .get(`/api/stems/status/${JOB_ID}`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.equal(typeof res.body.status, "string");
  assert.equal(typeof res.body.progress, "number");
  assert.ok(res.body.progress >= 0 && res.body.progress <= 100);
  assert.equal(res.body.status, "completed");
  assert.ok(Array.isArray(res.body.stems));
  assert.equal(res.body.stems.length, 1);
  assert.equal(res.body.stems[0].id, "vocals");
  assert.equal(typeof res.body.stems[0].url, "string");
  assert.match(res.body.stems[0].url, /\/api\/stems\/file\//);
  assert.ok(!res.body.stems[0].url.includes("token="));
});

test.after(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});
