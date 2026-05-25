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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-midi-health-"));
const blockedMidiPath = path.join(tempRoot, "blocked-midi-path");
fs.writeFileSync(blockedMidiPath, "not-a-directory", "utf-8");
process.env.MIDI_OUTPUT_DIR = blockedMidiPath;

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

test("GET /api/health reports degraded when backend MIDI storage is not usable", async () => {
  const res = await request.get("/api/health").expect(200);

  assert.equal(res.body.status, "degraded");
  assert.equal(res.body.services.midi.reachable, true);
  assert.equal(res.body.storage.midi_backend.ok, false);
  assert.equal(res.body.storage.midi_shared.aligned, false);
  assert.match(res.body.storage.midi_backend.error, /directory|midi/i);
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
