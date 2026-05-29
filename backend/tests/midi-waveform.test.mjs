import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

const JOB_ID = "77777777-7777-4777-8777-777777777777";
let lastWaveformPath;
let lastSpectrumPath;

const midiServiceServer = http.createServer((req, res) => {
  if (req.url?.startsWith(`/waveform/${JOB_ID}`) && req.method === "GET") {
    lastWaveformPath = req.url;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [0.1, 0.2, 0.3], points: 3 }));
    return;
  }
  if (req.url?.startsWith(`/spectrum/${JOB_ID}`) && req.method === "GET") {
    lastSpectrumPath = req.url;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [1, 2, 3], fft_size: 2048 }));
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

test("GET /api/midi/waveform proxies to midi_service with job token", async () => {
  const jobToken = issueJobToken(JOB_ID);
  const res = await request
    .get(`/api/midi/waveform/${JOB_ID}?points=128`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.deepEqual(res.body.data, [0.1, 0.2, 0.3]);
  assert.match(lastWaveformPath, /points=128/);
});

test("GET /api/midi/spectrum proxies to midi_service with job token", async () => {
  const jobToken = issueJobToken(JOB_ID);
  const res = await request
    .get(`/api/midi/spectrum/${JOB_ID}?fft_size=1024`)
    .set("x-job-token", jobToken)
    .expect(200);

  assert.deepEqual(res.body.data, [1, 2, 3]);
  assert.match(lastSpectrumPath, /fft_size=1024/);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
