import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.MIDI_OUTPUT_DIR = path.join(process.cwd(), "tmp", "test-midi-source");

const JOB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_ID = "user_source_audio";

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");
const request = supertest(app);

const jobDir = path.join(process.env.MIDI_OUTPUT_DIR, JOB_ID);
await mkdir(jobDir, { recursive: true });
await writeFile(
  path.join(jobDir, "metadata.json"),
  JSON.stringify({ user_id: USER_ID }),
);
await writeFile(path.join(jobDir, "input.wav"), Buffer.from("RIFF----WAVE"));

app.locals.verifyClerkBearer = async () => USER_ID;

test("GET /api/midi/source/:job_id streams job input audio for owner", async () => {
  const jobToken = issueJobToken(JOB_ID);
  const res = await request
    .get(`/api/midi/source/${JOB_ID}`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.match(res.headers["content-type"] || "", /audio\/wav/i);
  assert.ok(res.body.length > 0);
});

test("GET /api/midi/source/:job_id returns 404 when input missing", async () => {
  const missingId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await mkdir(path.join(process.env.MIDI_OUTPUT_DIR, missingId), { recursive: true });
  await writeFile(
    path.join(process.env.MIDI_OUTPUT_DIR, missingId, "metadata.json"),
    JSON.stringify({ user_id: USER_ID }),
  );

  const jobToken = issueJobToken(missingId);
  const res = await request
    .get(`/api/midi/source/${missingId}`)
    .set("x-job-token", jobToken)
    .expect(404);

  assert.match(res.body.error, /not found/i);
});
