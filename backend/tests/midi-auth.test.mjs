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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-midi-auth-"));
const midiOutputDir = path.join(tempRoot, "midi");
fs.mkdirSync(midiOutputDir, { recursive: true });
process.env.MIDI_OUTPUT_DIR = midiOutputDir;

const OWNER_JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB_ID = "44444444-4444-4444-8444-444444444444";
const USERLESS_JOB_ID = "55555555-5555-4555-8555-555555555555";
const DUMMY_MIDI_BYTES = Buffer.from("MThd0000", "utf-8");

function writeMidiJob(jobId, metadata) {
  const dir = path.join(midiOutputDir, jobId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "output.mid"), DUMMY_MIDI_BYTES);
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      job_id: jobId,
      notes_detected: 12,
      duration_seconds: 3.2,
      created_at: "2026-05-25T00:00:00.000Z",
      ...metadata,
    }),
    "utf-8",
  );
}

writeMidiJob(OWNER_JOB_ID, { user_id: "user-owner", stem_name: "vocals" });
writeMidiJob(OTHER_JOB_ID, { user_id: "user-other", stem_name: "bass" });
writeMidiJob(USERLESS_JOB_ID, { user_id: null, stem_name: "audio" });

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");

app.locals.verifyClerkBearer = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader === "Bearer token-owner") return "user-owner";
  if (authHeader === "Bearer token-other") return "user-other";
  throw Object.assign(new Error("Missing auth token"), { status: 401 });
};

const request = supertest(app);

test("GET /api/midi/file allows completed-job download for owner without job token", async () => {
  const res = await request
    .get(`/api/midi/file/${OWNER_JOB_ID}/output.mid`)
    .set("Authorization", "Bearer token-owner")
    .expect(200);

  assert.equal(res.headers["content-type"], "audio/midi");
  assert.deepEqual(res.body, DUMMY_MIDI_BYTES);
});

test("GET /api/midi/file rejects completed-job download for different user", async () => {
  await request
    .get(`/api/midi/file/${OWNER_JOB_ID}/output.mid`)
    .set("Authorization", "Bearer token-other")
    .expect(403);
});

test("GET /api/midi/file keeps token-only access for userless jobs", async () => {
  const jobToken = issueJobToken(USERLESS_JOB_ID);

  await request
    .get(`/api/midi/file/${USERLESS_JOB_ID}/output.mid`)
    .expect(401);

  const res = await request
    .get(`/api/midi/file/${USERLESS_JOB_ID}/output.mid`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.deepEqual(res.body, DUMMY_MIDI_BYTES);
});

test("GET /api/midi/history returns only records owned by the authenticated user", async () => {
  const res = await request
    .get("/api/midi/history")
    .set("Authorization", "Bearer token-owner")
    .expect(200);

  assert.equal(Array.isArray(res.body.conversions), true);
  assert.equal(res.body.conversions.length, 1);
  assert.equal(res.body.conversions[0].job_id, OWNER_JOB_ID);
  assert.equal(res.body.conversions[0].file_available, true);
});

test.after(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures in test
  }
});
