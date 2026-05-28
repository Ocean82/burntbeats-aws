import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.JOB_TOKEN_TTL_MS = "3600000";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

const EXPORT_ID = "12345678-1234-4234-8234-123456789abc";
let lastTokenHeader;

const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/export" && req.method === "POST") {
    lastTokenHeader = req.headers["x-midi-service-token"];
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ export_id: EXPORT_ID, status: "queued" }));
    });
    return;
  }
  if (req.url === `/export/status/${EXPORT_ID}` && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "completed", job_id: EXPORT_ID }));
    return;
  }
  if (req.url === `/export/file/${EXPORT_ID}/stems.zip` && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/zip");
    res.end(Buffer.from("PK\x03\x04", "binary"));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

const { app } = await import("../server.js");
const { issueJobToken } = await import("../middleware/auth.js");
const request = supertest(app);

test("POST /api/midi/export returns export token and status URL", async () => {
  const res = await request
    .post("/api/midi/export")
    .send({
      mode: "stems",
      selected_stems: ["vocals"],
      source_jobs: [{ job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stem_name: "vocals" }],
    })
    .expect(202);

  assert.equal(res.body.export_id, EXPORT_ID);
  assert.equal(res.body.status, "queued");
  assert.equal(typeof res.body.export_token, "string");
  assert.match(res.body.status_url, /\/api\/midi\/export\/status\//);
  assert.equal(lastTokenHeader, process.env.MIDI_SERVICE_API_TOKEN);
});

test("GET /api/midi/export/status requires job token", async () => {
  await request.get(`/api/midi/export/status/${EXPORT_ID}`).expect(401);
  const token = issueJobToken(EXPORT_ID);
  const res = await request
    .get(`/api/midi/export/status/${EXPORT_ID}`)
    .set("x-job-token", token)
    .expect(200);
  assert.equal(res.body.status, "completed");
});

test("GET /api/midi/export/file requires job token and proxies zip", async () => {
  await request.get(`/api/midi/export/file/${EXPORT_ID}/stems.zip`).expect(401);
  const token = issueJobToken(EXPORT_ID);
  const res = await request
    .get(`/api/midi/export/file/${EXPORT_ID}/stems.zip`)
    .set("x-job-token", token)
    .expect(200);
  assert.equal(res.headers["content-type"], "application/zip");
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
