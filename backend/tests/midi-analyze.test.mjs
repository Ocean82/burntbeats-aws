import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

let lastAnalyzeBody;
let lastMidiServiceTokenHeader;

const ANALYZE_RESPONSE = {
  key: "C",
  key_confidence: 0.82,
  mode: "major",
  bar_count: 2,
  bars: [{ bar: 1, chord: "C", confidence: 0.9, pitches: [60, 64, 67], note_count: 3, root: "C", quality: "" }],
  chord_progression: "C | G",
  total_notes: 6,
};

const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/analyze" && req.method === "POST") {
    lastMidiServiceTokenHeader = req.headers["x-midi-service-token"];
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      lastAnalyzeBody = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(ANALYZE_RESPONSE));
    });
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

await new Promise((resolve) => midiServiceServer.listen(0, "127.0.0.1", resolve));
process.env.MIDI_SERVICE_URL = `http://127.0.0.1:${midiServiceServer.address().port}`;

const { app } = await import("../server.js");
const request = supertest(app);

app.locals.verifyClerkBearer = async () => "user_test_analyze";

test("POST /api/midi/analyze proxies note payload and forwards auth header", async () => {
  lastAnalyzeBody = undefined;
  lastMidiServiceTokenHeader = undefined;

  const payload = {
    notes: [{ pitch: 60, start: 0, duration: 0.5, velocity: 90 }],
    bpm: 120,
    time_signature: "4/4",
  };

  const res = await request.post("/api/midi/analyze").send(payload).expect(200);

  assert.deepEqual(res.body, ANALYZE_RESPONSE);
  assert.deepEqual(lastAnalyzeBody, payload);
  assert.equal(lastMidiServiceTokenHeader, process.env.MIDI_SERVICE_API_TOKEN);
});

test("POST /api/midi/analyze rejects non-array notes", async () => {
  const res = await request
    .post("/api/midi/analyze")
    .send({ notes: "bad", bpm: 120, time_signature: "4/4" })
    .expect(400);

  assert.match(res.body.error, /array/i);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
