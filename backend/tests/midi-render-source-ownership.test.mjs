import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.USAGE_TOKENS_ENABLED = "0";
process.env.DEV_BYPASS_UPLOAD_AUTH = "1";
process.env.DATABASE_URL = "";

const OTHER_SOURCE_JOB_ID = "88888888-8888-4888-8888-888888888888";
const OWNER_SOURCE_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "user_other";
const AUTHENTICATED_USER_ID = "user_current";
const RENDER_JOB_ID = "99999999-9999-4999-8999-999999999999";
const RENDER_FILENAME = "render.wav";

let midiServiceCalls = 0;
const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/render" && req.method === "POST") {
    midiServiceCalls += 1;
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ job_id: RENDER_JOB_ID, status: "queued" }));
    });
    return;
  }

  if (req.url === `/render/status/${RENDER_JOB_ID}` && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        job_id: RENDER_JOB_ID,
        status: "completed",
        result: { filename: RENDER_FILENAME },
      }),
    );
    return;
  }

  if (req.url === `/render/file/${RENDER_JOB_ID}/${RENDER_FILENAME}` && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/wav");
    res.end(Buffer.from("RIFF....WAVEfmt "));
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

const { app } = await import("../server.js");
const request = supertest(app);

app.locals.verifyClerkBearer = async () => AUTHENTICATED_USER_ID;
app.locals.getJobOwner = async (jobId) => {
  if (jobId === OTHER_SOURCE_JOB_ID) return OTHER_USER_ID;
  if (jobId === OWNER_SOURCE_JOB_ID) return AUTHENTICATED_USER_ID;
  if (jobId === RENDER_JOB_ID) return AUTHENTICATED_USER_ID;
  return null;
};

test("POST /api/midi/render rejects source MIDI jobs owned by another user", async () => {
  midiServiceCalls = 0;

  const res = await request
    .post("/api/midi/render")
    .send({ source_job_id: OTHER_SOURCE_JOB_ID, format: "wav" })
    .expect(403);

  assert.match(res.body.error, /access/i);
  assert.equal(midiServiceCalls, 0);
});

test("POST /api/midi/render allows source MIDI jobs owned by the authenticated user", async () => {
  midiServiceCalls = 0;

  const res = await request
    .post("/api/midi/render")
    .send({ source_job_id: OWNER_SOURCE_JOB_ID, format: "wav" })
    .expect(202);

  assert.equal(res.body.job_id, RENDER_JOB_ID);
  assert.equal(midiServiceCalls, 1);
});

test("GET /api/midi/render/status/:job_id allows owned render jobs", async () => {
  const res = await request
    .get(`/api/midi/render/status/${RENDER_JOB_ID}`)
    .expect(200);

  assert.equal(res.body.job_id, RENDER_JOB_ID);
  assert.equal(res.body.status, "completed");
});

test("GET /api/midi/render/file/:job_id allows owned render job downloads", async () => {
  const res = await request
    .get(`/api/midi/render/file/${RENDER_JOB_ID}`)
    .expect(200);

  assert.equal(res.headers["content-type"], "audio/wav");
  assert.equal(Buffer.from(res.body).toString("utf8"), "RIFF....WAVEfmt ");
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
