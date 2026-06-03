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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-speech-auth-"));
const speechOutputDir = path.join(tempRoot, "speech");
fs.mkdirSync(speechOutputDir, { recursive: true });
process.env.SPEECH_OUTPUT_DIR = speechOutputDir;

const OWNER_JOB_ID = "66666666-6666-4666-8666-666666666666";
const USERLESS_JOB_ID = "77777777-7777-4777-8777-777777777777";
const DUMMY_WAV = Buffer.from("RIFF....WAVEfmt ");

function writeSpeechJob(jobId, progress) {
  const dir = path.join(speechOutputDir, jobId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "progress.json"),
    JSON.stringify(progress),
    "utf-8",
  );
  fs.writeFileSync(path.join(dir, "enhanced.wav"), DUMMY_WAV);
}

writeSpeechJob(OWNER_JOB_ID, { status: "completed", progress: 100 });
writeSpeechJob(USERLESS_JOB_ID, { status: "completed", progress: 100 });

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");

app.locals.verifyClerkBearer = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader === "Bearer speech-owner") return "user-speech-owner";
  if (authHeader === "Bearer speech-other") return "user-speech-other";
  throw Object.assign(new Error("Missing auth token"), { status: 401 });
};

/** @type {Record<string, string>} */
const dbJobOwners = {
  [OWNER_JOB_ID]: "user-speech-owner",
};
app.locals.getJobOwner = async (jobId) => dbJobOwners[jobId] ?? null;

const request = supertest(app);

test("GET /api/speech/status requires Clerk when job has DB owner", async () => {
  await request.get(`/api/speech/status/${OWNER_JOB_ID}`).expect(401);

  const res = await request
    .get(`/api/speech/status/${OWNER_JOB_ID}`)
    .set("Authorization", "Bearer speech-owner")
    .expect(200);

  assert.equal(res.body.status, "completed");
});

test("GET /api/speech/file rejects different user for owned job", async () => {
  await request
    .get(`/api/speech/file/${OWNER_JOB_ID}/enhanced.wav`)
    .set("Authorization", "Bearer speech-other")
    .expect(403);
});

test("GET /api/speech/file allows job token when job has no DB owner", async () => {
  const jobToken = issueJobToken(USERLESS_JOB_ID);

  await request.get(`/api/speech/file/${USERLESS_JOB_ID}/enhanced.wav`).expect(401);

  const res = await request
    .get(`/api/speech/file/${USERLESS_JOB_ID}/enhanced.wav`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.equal(res.headers["content-type"], "audio/wav");
});

test.after(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures in test
  }
});
