// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { UPLOAD_TMP_DIR } from "../middleware/upload.js";
import {
  assertUploadProcessingPath,
  UPLOAD_PROCESSING_BASES,
} from "./uploadPaths.js";
import { resolvePathUnderAllowedBases } from "./safePath.js";

test("assertUploadProcessingPath allows multer upload dir files", () => {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_TMP_DIR, `probe-${Date.now()}.wav`);
  fs.writeFileSync(filePath, "RIFF");
  const trusted = assertUploadProcessingPath(filePath);
  assert.ok(trusted);
  assert.equal(path.basename(trusted), path.basename(filePath));
});

test("assertUploadProcessingPath allows stem temp downloads", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burntbeats-stem-"));
  const filePath = path.join(tempDir, "vocals.wav");
  fs.writeFileSync(filePath, "RIFF");
  const trusted = assertUploadProcessingPath(filePath);
  assert.ok(trusted);
  assert.equal(path.basename(trusted), "vocals.wav");
});

test("assertUploadProcessingPath rejects paths outside allowed roots", () => {
  assert.equal(assertUploadProcessingPath("/etc/passwd"), null);
});

test("resolvePathUnderAllowedBases rejects symlink escape from upload dir", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bb-symlink-base-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "bb-symlink-outside-"));
  const secret = path.join(outside, "secret.txt");
  fs.writeFileSync(secret, "secret");
  const link = path.join(base, "escape.txt");

  try {
    fs.symlinkSync(secret, link, "file");
  } catch {
    return;
  }

  assert.equal(resolvePathUnderAllowedBases(link, UPLOAD_PROCESSING_BASES), null);
  assert.equal(resolvePathUnderAllowedBases(link, [base]), null);
});
