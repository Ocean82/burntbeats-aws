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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-midi-convert-"));
const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

const STEM_JOB_ID = "66666666-6666-4666-8666-666666666666";
const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/convert" && req.method === "POST") {
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          job_id: "77777777-7777-4777-8777-777777777777",
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

const stemDir = path.join(stemOutputDir, STEM_JOB_ID, "stems");
fs.mkdirSync(stemDir, { recursive: true });
fs.writeFileSync(path.join(stemDir, "lead-vocal-2.wav"), Buffer.from("RIFF....WAVEfmt "));

const { app } = await import("../server.js");
const request = supertest(app);

test("POST /api/midi/convert rejects AAC uploads for the MIDI pipeline", async () => {
  const res = await request
    .post("/api/midi/convert")
    .attach("file", Buffer.from("not-real-aac"), {
      filename: "recording.aac",
      contentType: "audio/aac",
    })
    .expect(415);

  assert.match(res.body.error, /midi/i);
  assert.match(res.body.error, /mp3|wav|flac|ogg|m4a|webm/i);
});

test("POST /api/midi/convert resolves existing stem files with safe hyphenated names", async () => {
  const res = await request
    .post("/api/midi/convert")
    .field("stem_job_id", STEM_JOB_ID)
    .field("stem_name", "lead-vocal-2")
    .expect(202);

  assert.equal(res.body.job_id, "77777777-7777-4777-8777-777777777777");
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});
