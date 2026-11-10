// @ts-check
/**
 * Regression: MIDI export enqueue must authorize every source conversion.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret-for-export-ownership";
process.env.REDIS_URL = "";
process.env.USAGE_TOKENS_ENABLED = "";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-midi-export-ownership-"),
);
const midiOutputDir = path.join(tempRoot, "midi");
fs.mkdirSync(midiOutputDir, { recursive: true });
process.env.MIDI_OUTPUT_DIR = midiOutputDir;

const VICTIM_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const exportRequests = [];

const victimJobDir = path.join(midiOutputDir, VICTIM_JOB_ID);
fs.mkdirSync(victimJobDir, { recursive: true });
fs.writeFileSync(
  path.join(victimJobDir, "metadata.json"),
  JSON.stringify({
    job_id: VICTIM_JOB_ID,
    user_id: "victim_user",
    stem_name: "vocals",
    notes_detected: 12,
  }),
);

const midiService = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/export") {
    exportRequests.push(req.url);
    req.resume();
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        export_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "queued",
      }),
    );
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

await new Promise((resolve) => midiService.listen(0, "127.0.0.1", resolve));
const address = midiService.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to start mock MIDI service");
}
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${address.port}`;

const { app } = await import("../../../server.js");
app.locals.verifyClerkBearer = async () => "attacker_user";

const request = supertest(app);

test("POST /api/midi/export rejects source jobs owned by another user before enqueue", async () => {
  exportRequests.length = 0;

  const res = await request
    .post("/api/midi/export")
    .set("Authorization", "Bearer test-token")
    .send({
      mode: "stems",
      format: "midi1",
      selected_stems: ["vocals"],
      source_jobs: [
        {
          job_id: VICTIM_JOB_ID,
          stem_name: "vocals",
          bpm: 120,
        },
      ],
    });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, `You do not have access to job ${VICTIM_JOB_ID}.`);
  assert.deepEqual(exportRequests, []);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiService.close((error) => (error ? reject(error) : resolve())),
  );
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
