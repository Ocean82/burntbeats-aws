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
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-speech-validation-"));
const speechOutputDir = path.join(tempRoot, "speech");
fs.mkdirSync(speechOutputDir, { recursive: true });
process.env.SPEECH_OUTPUT_DIR = speechOutputDir;

const { app } = await import("../server.js");

app.locals.verifyClerkBearer = async () => "user-speech-test";

const request = supertest(app);

function attachInvalid(contentType, filename = "upload.bin") {
  return request
    .post("/api/speech/enhance")
    .attach("file", Buffer.from("not an audio file"), {
      filename,
      contentType,
    });
}

test("POST /api/speech/enhance rejects text/plain with 415", async () => {
  const res = await attachInvalid("text/plain").expect(415);
  assert.match((res.body.error || "").toLowerCase(), /audio|media type|invalid file type/);
});

test("POST /api/speech/enhance rejects application/octet-stream with 415", async () => {
  const res = await attachInvalid("application/octet-stream").expect(415);
  assert.match((res.body.error || "").toLowerCase(), /audio|media type|invalid file type/);
});

test("POST /api/speech/enhance rejects missing filename with generic error", async () => {
  const res = await request
    .post("/api/speech/enhance")
    .attach("file", Buffer.from("not an audio file"), {
      contentType: "audio/wav",
    })
    .expect(400);
  assert.ok(res.body.error, "Expected error body for missing filename");
});

test("POST /api/speech/enhance rejects empty buffer with 415", async () => {
  const res = await request
    .post("/api/speech/enhance")
    .attach("file", Buffer.from(""), {
      filename: "empty.wav",
      contentType: "audio/wav",
    })
    .expect(415);
  assert.match((res.body.error || "").toLowerCase(), /audio|media type|invalid file type|does not look like/);
});

test("POST /api/speech/enhance rejects missing file with 400", async () => {
  const res = await request
    .post("/api/speech/enhance")
    .expect(400);
  assert.match((res.body.error || "").toLowerCase(), /missing file/);
});

test.after(async () => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});
