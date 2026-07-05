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
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.STRIPE_SECRET_KEY = "";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-contract-health-"));
const midiOutputDir = path.join(tempRoot, "midi");
fs.mkdirSync(midiOutputDir, { recursive: true });
fs.writeFileSync(
  path.join(midiOutputDir, ".midi-service-storage.json"),
  JSON.stringify({
    updated_at: "2026-05-25T00:00:00.000Z",
    output_dir: "/repo/tmp/midi",
    resolved_output_dir: "/repo/tmp/midi",
    service: "midi_service",
  }),
  "utf-8",
);
process.env.MIDI_OUTPUT_DIR = midiOutputDir;

function makeHealthServer(payload) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  return server;
}

const stemServer = makeHealthServer({ status: "ok" });
const speechServer = makeHealthServer({ status: "ok" });
const midiServer = makeHealthServer({
  status: "ok",
  storage: {
    ok: true,
    output_dir: "/repo/tmp/midi",
    resolved_output_dir: "/repo/tmp/midi",
    can_read: true,
    can_write: true,
    sentinel_filename: ".midi-service-storage.json",
  },
});

await Promise.all([
  new Promise((resolve) => stemServer.listen(0, "127.0.0.1", resolve)),
  new Promise((resolve) => speechServer.listen(0, "127.0.0.1", resolve)),
  new Promise((resolve) => midiServer.listen(0, "127.0.0.1", resolve)),
]);

process.env.STEM_SERVICE_URL = `http://127.0.0.1:${stemServer.address().port}`;
process.env.SPEECH_SERVICE_URL = `http://127.0.0.1:${speechServer.address().port}`;
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServer.address().port}`;

const { app } = await import("../server.js");
const request = supertest(app);

test("GET /api/health returns required contract fields", async () => {
  const res = await request.get("/api/health").expect(200);

  assert.ok("status" in res.body);
  assert.ok(["ok", "degraded"].includes(res.body.status));
  assert.ok("uptime_seconds" in res.body);
  assert.equal(typeof res.body.uptime_seconds, "number");
  assert.ok("database" in res.body);
  assert.equal(typeof res.body.database.connected, "boolean");
  assert.ok("services" in res.body);
  assert.ok("stem" in res.body.services);
  assert.ok("speech" in res.body.services);
  assert.ok("midi" in res.body.services);
  assert.ok("version" in res.body);
});

test("GET /api/health exposes secrets presence flags", async () => {
  const res = await request.get("/api/health").expect(200);

  assert.ok("secrets" in res.body);
  assert.equal(typeof res.body.secrets.clerk, "boolean");
  assert.equal(typeof res.body.secrets.job_token, "boolean");
  assert.equal(typeof res.body.secrets.stripe, "boolean");
  assert.equal(res.body.secrets.clerk, true);
  assert.equal(res.body.secrets.job_token, true);
  assert.equal(res.body.secrets.stripe, false);
});

test.after(async () => {
  await Promise.all([
    new Promise((resolve, reject) => stemServer.close((err) => (err ? reject(err) : resolve()))),
    new Promise((resolve, reject) =>
      speechServer.close((err) => (err ? reject(err) : resolve())),
    ),
    new Promise((resolve, reject) => midiServer.close((err) => (err ? reject(err) : resolve()))),
  ]);
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});
