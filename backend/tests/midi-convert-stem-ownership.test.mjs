import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.DATABASE_URL = "";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-midi-owner-"));
const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

const OTHER_STEM_JOB_ID = "88888888-8888-4888-8888-888888888888";
const OTHER_USER_ID = "user_other";
const AUTHENTICATED_USER_ID = "user_current";

let midiServiceCalls = 0;
const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/convert" && req.method === "POST") {
    midiServiceCalls += 1;
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          job_id: "99999999-9999-4999-8999-999999999999",
          status: "queued",
        }),
      );
    });
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

const stemDir = path.join(stemOutputDir, OTHER_STEM_JOB_ID, "stems");
fs.mkdirSync(stemDir, { recursive: true });
fs.writeFileSync(path.join(stemDir, "vocals.wav"), Buffer.from("RIFF....WAVEfmt "));

const { app } = await import("../server.js");
const request = supertest(app);

app.locals.verifyClerkBearer = async () => AUTHENTICATED_USER_ID;
app.locals.getJobOwner = async (jobId) =>
  jobId === OTHER_STEM_JOB_ID ? OTHER_USER_ID : null;

test("POST /api/midi/convert rejects stems owned by another user", async () => {
  const res = await request
    .post("/api/midi/convert")
    .field("stem_job_id", OTHER_STEM_JOB_ID)
    .field("stem_name", "vocals")
    .expect(403);

  assert.match(res.body.error, /access/i);
  assert.equal(midiServiceCalls, 0);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
