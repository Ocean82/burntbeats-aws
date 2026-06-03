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

const JOB_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "user_midi_db_owner";
let lastMidiServiceTokenHeader;

const midiServiceServer = http.createServer((req, res) => {
  if (req.url === `/status/${JOB_ID}` && req.method === "GET") {
    lastMidiServiceTokenHeader = req.headers["x-midi-service-token"];
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "completed", job_id: JOB_ID, progress: 100 }));
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

app.locals.verifyClerkBearer = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader === "Bearer test-token") return USER_ID;
  throw Object.assign(new Error("Missing auth token"), { status: 401 });
};
app.locals.getJobOwner = async (jobId) =>
  jobId === JOB_ID ? USER_ID : null;

test("GET /api/midi/status requires Clerk when job has DB owner", async () => {
  await request.get(`/api/midi/status/${JOB_ID}`).expect(401);

  const jobToken = issueJobToken(JOB_ID);
  await request
    .get(`/api/midi/status/${JOB_ID}`)
    .set("x-job-token", jobToken)
    .expect(401);

  lastMidiServiceTokenHeader = undefined;
  const res = await request
    .get(`/api/midi/status/${JOB_ID}`)
    .set("Authorization", "Bearer test-token")
    .expect(200);

  assert.equal(res.body.status, "completed");
  assert.equal(lastMidiServiceTokenHeader, process.env.MIDI_SERVICE_API_TOKEN);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
