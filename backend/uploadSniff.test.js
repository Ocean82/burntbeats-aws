// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { UPLOAD_TMP_DIR } from "./middleware/upload.js";
import { verifyUploadMatchesExtension } from "./uploadSniff.js";

function writeTemp(name, buf) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  const p = path.join(UPLOAD_TMP_DIR, name);
  fs.writeFileSync(p, buf);
  return p;
}

test("WAV magic matches .wav", () => {
  const wav = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WAVE"),
    Buffer.alloc(4),
  ]);
  const p = writeTemp(`x-${Date.now()}.wav`, wav);
  const r = verifyUploadMatchesExtension(p, ".wav");
  assert.equal(r.ok, true);
});

test("fake WAV extension with wrong bytes fails", () => {
  const p = writeTemp(`fake-${Date.now()}.wav`, Buffer.from("not a wav file!!"));
  const r = verifyUploadMatchesExtension(p, ".wav");
  assert.equal(r.ok, false);
});

test("MP3 with frame sync passes", () => {
  const p = writeTemp(`x-${Date.now()}.mp3`, Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  const r = verifyUploadMatchesExtension(p, ".mp3");
  assert.equal(r.ok, true);
});

test("rejects paths outside upload processing roots", () => {
  const r = verifyUploadMatchesExtension("/etc/passwd", ".wav");
  assert.equal(r.ok, false);
});

test("rejects traversal paths even when extension matches", () => {
  const r = verifyUploadMatchesExtension(
    path.join(UPLOAD_TMP_DIR, "..", "etc", "passwd"),
    ".wav",
  );
  assert.equal(r.ok, false);
});
