import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "";
process.env.MIDI_SERVICE_API_TOKEN = "midi-service-test-token";

const FIRST_JOB_ID = "12121212-1212-4212-8212-121212121212";
const SECOND_JOB_ID = "34343434-3434-4434-8434-343434343434";
const MERGED_MIDI_BYTES = Buffer.from("MThd0000", "utf-8");

let lastMergeBody;
let lastMidiServiceTokenHeader;

const midiServiceServer = http.createServer((req, res) => {
  if (req.url === "/merge" && req.method === "POST") {
    lastMidiServiceTokenHeader = req.headers["x-midi-service-token"];
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      lastMergeBody = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/midi");
      res.setHeader("X-Merge-Tracks", "2");
      res.end(MERGED_MIDI_BYTES);
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

app.locals.verifyClerkBearer = async () => "user_test_merge";

test("POST /api/midi/merge streams merged MIDI and forwards auth header", async () => {
  lastMergeBody = undefined;
  lastMidiServiceTokenHeader = undefined;

  const res = await request
    .post("/api/midi/merge")
    .send({
      jobs: [
        { job_id: FIRST_JOB_ID, stem_name: "vocals", program: 52 },
        { job_id: SECOND_JOB_ID, stem_name: "drums", is_drum: true },
      ],
    })
    .expect(200);

  assert.equal(res.headers["content-type"], "audio/midi");
  assert.equal(res.headers["x-merge-tracks"], "2");
  assert.deepEqual(res.body, MERGED_MIDI_BYTES);
  assert.deepEqual(lastMergeBody, {
    jobs: [
      { job_id: FIRST_JOB_ID, stem_name: "vocals", program: 52 },
      { job_id: SECOND_JOB_ID, stem_name: "drums", is_drum: true },
    ],
    bpm: 120,
  });
  assert.equal(lastMidiServiceTokenHeader, process.env.MIDI_SERVICE_API_TOKEN);
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    midiServiceServer.close((err) => (err ? reject(err) : resolve())),
  );
});
