// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyUploadMatchesExtension } from "./uploadSniff.js";

function writeTemp(name, buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-sniff-"));
  const p = path.join(dir, name);
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
  const p = writeTemp("x.wav", wav);
  const r = verifyUploadMatchesExtension(p, ".wav");
  assert.equal(r.ok, true);
});

test("fake WAV extension with wrong bytes fails", () => {
  const p = writeTemp("fake.wav", Buffer.from("not a wav file!!"));
  const r = verifyUploadMatchesExtension(p, ".wav");
  assert.equal(r.ok, false);
});

test("MP3 with frame sync passes", () => {
  const p = writeTemp("x.mp3", Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  const r = verifyUploadMatchesExtension(p, ".mp3");
  assert.equal(r.ok, true);
});
