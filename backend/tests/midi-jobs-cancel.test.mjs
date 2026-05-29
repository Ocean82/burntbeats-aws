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

const JOB_ID = "77777777-7777-4777-8777-777777777777";
let lastMidiServiceTokenHeader;
let lastDeleteMethod;

const midiServiceServer = http.createServer((req, res) => {
  if (req.url === `/jobs/${JOB_ID}` && req.method === "DELETE") {
    lastDeleteMethod = req.method;
    lastMidiServiceTokenHeader = req.headers["x-midi-service-token"];
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        job_id: JOB_ID,
        status: "cancelled",
        message: "Queued job cancelled",
      }),
    );
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

test("DELETE /api/midi/jobs/:id requires a valid job token when protection is enabled", async () => {
  await request.delete(`/api/midi/jobs/${JOB_ID}`).expect(401);

  lastDeleteMethod = undefined;
  lastMidiServiceTokenHeader = undefined;
  const jobToken = issueJobToken(JOB_ID);
  const res = await request
    .delete(`/api/midi/jobs/${JOB_ID}`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.equal(lastDeleteMethod, "DELETE");
  assert.equal(res.body.status, "cancelled");
  assert.equal(res.body.job_id, JOB_ID);
  assert.equal(lastMidiServiceTokenHeader, process.env.MIDI_SERVICE_API_TOKEN);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
