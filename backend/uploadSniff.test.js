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

test("MP3 with large ID3 tag still passes", () => {
  const id3Size = 5000;
  const id3Header = Buffer.from([
    0x49,
    0x44,
    0x33, // "ID3"
    0x04,
    0x00,
    0x00,
    (id3Size >> 21) & 0x7f,
    (id3Size >> 14) & 0x7f,
    (id3Size >> 7) & 0x7f,
    id3Size & 0x7f,
  ]);
  const mp3FrameStart = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const p = writeTemp(
    "id3-large.mp3",
    Buffer.concat([id3Header, Buffer.alloc(id3Size), mp3FrameStart]),
  );
  const r = verifyUploadMatchesExtension(p, ".mp3");
  assert.equal(r.ok, true);
});
