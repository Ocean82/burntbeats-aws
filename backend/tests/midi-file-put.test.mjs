import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.MIDI_OUTPUT_DIR = path.join(process.cwd(), "tmp", "test-midi-file-put");

const JOB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "user_editor_789";
const MINIMAL_MIDI = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04, 0x00, 0xff, 0x2f, 0x00,
]);

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");
const request = supertest(app);

const jobDir = path.join(process.env.MIDI_OUTPUT_DIR, JOB_ID);
await mkdir(jobDir, { recursive: true });
await writeFile(
  path.join(jobDir, "metadata.json"),
  JSON.stringify({ user_id: USER_ID }),
);
await writeFile(path.join(jobDir, "output.mid"), MINIMAL_MIDI);

app.locals.verifyClerkBearer = async () => USER_ID;

test("PUT /api/midi/file saves edited MIDI for job owner", async () => {
  const edited = Buffer.concat([MINIMAL_MIDI, Buffer.from([0x00])]);
  const jobToken = issueJobToken(JOB_ID);

  const res = await request
    .put(`/api/midi/file/${JOB_ID}/output.mid`)
    .set("x-job-token", jobToken)
    .send({ data: edited.toString("base64") })
    .expect(200);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.bytes, edited.length);

  const saved = await readFile(path.join(jobDir, "output.mid"));
  assert.equal(saved.length, edited.length);
});
