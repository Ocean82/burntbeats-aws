import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.MIDI_OUTPUT_DIR = path.join(process.cwd(), "tmp", "test-midi-merge-auth");

const OWNER_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "user_owner_123";

const { app } = await import("../server.js");
const request = supertest(app);

app.locals.verifyClerkBearer = async () => USER_ID;

const jobDir = (jobId) =>
  path.join(process.env.MIDI_OUTPUT_DIR, jobId);

await mkdir(jobDir(OWNER_JOB_ID), { recursive: true });
await mkdir(jobDir(OTHER_JOB_ID), { recursive: true });
await writeFile(
  path.join(jobDir(OWNER_JOB_ID), "metadata.json"),
  JSON.stringify({ user_id: USER_ID }),
);
await writeFile(
  path.join(jobDir(OTHER_JOB_ID), "metadata.json"),
  JSON.stringify({ user_id: "user_other_456" }),
);

test("POST /api/midi/merge rejects jobs owned by another user", async () => {
  const res = await request
    .post("/api/midi/merge")
    .send({
      jobs: [
        { job_id: OWNER_JOB_ID, stem_name: "vocals" },
        { job_id: OTHER_JOB_ID, stem_name: "drums" },
      ],
    })
    .expect(403);

  assert.match(res.body.error, /do not have access/i);
});
