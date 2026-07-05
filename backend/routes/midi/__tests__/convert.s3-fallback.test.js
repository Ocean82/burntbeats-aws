// @ts-check
/**
 * Integration: stem-to-MIDI convert uses S3 fallback when local stem WAV is absent.
 * Mocks presign + fetch so no real AWS credentials are required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import supertest from "supertest";

process.env.NODE_ENV = "test";
process.env.BACKEND_SKIP_START = "1";
process.env.API_KEY = "";
process.env.JOB_TOKEN_SECRET = "test-job-token-secret-for-s3-fallback";
process.env.REDIS_URL = "";
process.env.USAGE_TOKENS_ENABLED = "";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "burntbeats-convert-s3-"),
);
const stemOutputDir = path.join(tempRoot, "stems");
fs.mkdirSync(stemOutputDir, { recursive: true });
process.env.STEM_OUTPUT_DIR = stemOutputDir;

const STEM_JOB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STEM_NAME = "vocals";
const MIDI_JOB_ID = "11111111-1111-4111-8111-111111111111";

const jobDir = path.join(stemOutputDir, STEM_JOB_ID);
fs.mkdirSync(jobDir, { recursive: true });
fs.writeFileSync(
  path.join(jobDir, "progress.json"),
  JSON.stringify({
    status: "completed",
    s3: {
      bucket: "integration-test-bucket",
      region: "us-east-1",
      keys: {
        vocals: "stems/dddddddd-dddd-4ddd-8ddd-dddddddddddd/vocals.wav",
      },
    },
  }),
);

const presignCalls = [];
const fetchCalls = [];
const wavBytes = Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt ");

const {
  setResolveStemAudioDepsForTests,
  resetResolveStemAudioDepsForTests,
} = await import("../../../helpers/resolveStemAudio.js");

setResolveStemAudioDepsForTests({
  presignStemGetUrl: async (bucket, key, region) => {
    presignCalls.push({ bucket, key, region });
    return "https://mock.example/presigned/vocals.wav";
  },
  fetchFn: async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(wavBytes));
          controller.close();
        },
      }),
    };
  },
});

const { app } = await import("../../../server.js");
const { issueJobToken } = await import("../../../middleware/auth.js");
const { midiServiceClient } = await import("../../../lib/serviceClients.js");

app.locals.verifyClerkBearer = async () => "user_convert_s3_fallback_test";

const request = supertest(app);

test("POST /api/midi/convert resolves stem via S3 when local WAV is absent", async () => {
  presignCalls.length = 0;
  fetchCalls.length = 0;

  const originalCall = midiServiceClient.breaker.call.bind(
    midiServiceClient.breaker,
  );

  midiServiceClient.breaker.call = async (_fn) => ({
    statusCode: 202,
    data: { job_id: MIDI_JOB_ID, status: "queued" },
  });

  try {
    const res = await request
      .post("/api/midi/convert")
      .set("x-job-token", issueJobToken(STEM_JOB_ID))
      .field("stem_job_id", STEM_JOB_ID)
      .field("stem_name", STEM_NAME);

    assert.equal(
      res.status,
      202,
      `expected 202, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    assert.equal(res.body.job_id, MIDI_JOB_ID);
    assert.ok(res.body.file_url?.includes(MIDI_JOB_ID));
    assert.deepEqual(presignCalls, [
      {
        bucket: "integration-test-bucket",
        key: "stems/dddddddd-dddd-4ddd-8ddd-dddddddddddd/vocals.wav",
        region: "us-east-1",
      },
    ]);
    assert.deepEqual(fetchCalls, ["https://mock.example/presigned/vocals.wav"]);
  } finally {
    midiServiceClient.breaker.call = originalCall;
  }
});

test.after(() => {
  resetResolveStemAudioDepsForTests();
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
