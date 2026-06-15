// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-stem-audio-"));
process.env.STEM_OUTPUT_DIR = path.join(tempRoot, "stems");

const STEM_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STEM_NAME = "vocals";

const { resolveStemPathLocal, resolveStemAudioPath, cleanupTempStemFile, setResolveStemAudioDepsForTests, resetResolveStemAudioDepsForTests } = await import(
  "./resolveStemAudio.js"
);

test("resolveStemPathLocal returns path when stem WAV exists on disk", () => {
  const stemDir = path.join(process.env.STEM_OUTPUT_DIR, STEM_JOB_ID, "stems");
  fs.mkdirSync(stemDir, { recursive: true });
  const wavPath = path.join(stemDir, `${STEM_NAME}.wav`);
  fs.writeFileSync(wavPath, Buffer.from("RIFF"));

  assert.equal(resolveStemPathLocal(STEM_JOB_ID, STEM_NAME), wavPath);
});

test("resolveStemPathLocal returns null for missing stem", () => {
  assert.equal(
    resolveStemPathLocal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "drums"),
    null,
  );
});

test("resolveStemAudioPath prefers local disk over S3 metadata", async () => {
  const stemDir = path.join(process.env.STEM_OUTPUT_DIR, STEM_JOB_ID, "stems");
  fs.mkdirSync(stemDir, { recursive: true });
  const wavPath = path.join(stemDir, `${STEM_NAME}.wav`);
  fs.writeFileSync(wavPath, Buffer.from("RIFF"));
  fs.writeFileSync(
    path.join(process.env.STEM_OUTPUT_DIR, STEM_JOB_ID, "progress.json"),
    JSON.stringify({
      s3: {
        bucket: "test-bucket",
        keys: { vocals: "stems/job/vocals.wav" },
      },
    }),
  );

  const resolved = await resolveStemAudioPath(STEM_JOB_ID, STEM_NAME);
  assert.deepEqual(resolved, { filePath: wavPath, isTempFile: false });
});

test("resolveStemAudioPath returns null when stem is missing locally and S3 metadata absent", async () => {
  const missingJobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.equal(await resolveStemAudioPath(missingJobId, "bass"), null);
});

test("resolveStemAudioPath downloads from S3 when local WAV is absent", async () => {
  const s3OnlyJobId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  fs.mkdirSync(path.join(process.env.STEM_OUTPUT_DIR, s3OnlyJobId), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(process.env.STEM_OUTPUT_DIR, s3OnlyJobId, "progress.json"),
    JSON.stringify({
      s3: {
        bucket: "test-bucket",
        region: "us-east-1",
        keys: { vocals: "stems/job/vocals.wav" },
      },
    }),
  );

  const presignCalls = [];
  const fetchCalls = [];
  const wavBytes = Buffer.from("RIFF\x00\x00\x00\x00WAVEfmt ");

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

  let resolved = null;
  try {
    resolved = await resolveStemAudioPath(s3OnlyJobId, STEM_NAME);
    assert.ok(resolved);
    assert.equal(resolved.isTempFile, true);
    assert.ok(fs.existsSync(resolved.filePath));
    assert.deepEqual(presignCalls, [
      {
        bucket: "test-bucket",
        key: "stems/job/vocals.wav",
        region: "us-east-1",
      },
    ]);
    assert.deepEqual(fetchCalls, ["https://mock.example/presigned/vocals.wav"]);
  } finally {
    resetResolveStemAudioDepsForTests();
    if (resolved?.filePath) {
      await cleanupTempStemFile(resolved.filePath);
    }
  }
});

test.after(() => {
  resetResolveStemAudioDepsForTests();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
