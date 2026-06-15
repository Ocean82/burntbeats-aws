// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import os from "os";

import {
  isSafePathSegment,
  resolveExistingPathWithinBase,
  resolvePathUnderAllowedBases,
  resolvePathWithinBase,
  resolveUuidJobDir,
} from "./safePath.js";

test("isSafePathSegment rejects traversal segments", () => {
  assert.equal(isSafePathSegment(".."), false);
  assert.equal(isSafePathSegment("../etc/passwd"), false);
  assert.equal(isSafePathSegment("vocals.wav"), true);
});

test("isSafePathSegment rejects absolute segments", () => {
  assert.equal(isSafePathSegment("/etc/passwd"), false);
});

test("resolvePathWithinBase blocks escape from base", () => {
  const base = path.join(os.tmpdir(), "bb-safe-path-test");
  assert.equal(resolvePathWithinBase(base, "..", "etc", "passwd"), null);
  const ok = resolvePathWithinBase(base, "job-id", "input.wav");
  assert.ok(ok);
  assert.ok(ok.startsWith(path.resolve(base)));
});

test("resolvePathWithinBase allows new files under existing directories", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bb-safe-path-new-"));
  const jobDir = path.join(base, "job-id");
  fs.mkdirSync(jobDir);
  const target = resolvePathWithinBase(base, "job-id", "new-output.wav");
  assert.ok(target);
  assert.equal(path.basename(target), "new-output.wav");
});

test("resolvePathWithinBase rejects symlink directory hops", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bb-safe-path-symlink-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "bb-safe-path-outside-"));
  const jobDir = path.join(base, "job-id");
  fs.mkdirSync(jobDir);
  const link = path.join(jobDir, "stems");
  try {
    fs.symlinkSync(outside, link, "dir");
  } catch {
    return;
  }
  assert.equal(resolvePathWithinBase(base, "job-id", "stems", "vocals.wav"), null);
});

test("resolveExistingPathWithinBase returns canonical path for existing files", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bb-safe-path-existing-"));
  const filePath = path.join(base, "input.wav");
  fs.writeFileSync(filePath, "RIFF");
  const resolved = resolveExistingPathWithinBase(base, "input.wav");
  assert.ok(resolved);
  assert.equal(resolved, fs.realpathSync.native(filePath));
});

test("resolveUuidJobDir requires UUID", () => {
  const base = path.join(os.tmpdir(), "bb-safe-path-uuid");
  assert.equal(resolveUuidJobDir(base, "not-a-uuid"), null);
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.ok(resolveUuidJobDir(base, id));
});

test("resolvePathUnderAllowedBases only allows listed roots", () => {
  const stemBase = path.join(os.tmpdir(), "bb-stems");
  const midiBase = path.join(os.tmpdir(), "bb-midi");
  const inside = path.join(stemBase, "550e8400-e29b-41d4-a716-446655440000", "input.wav");
  assert.equal(
    resolvePathUnderAllowedBases(inside, [stemBase, midiBase]),
    path.resolve(inside),
  );
  assert.equal(
    resolvePathUnderAllowedBases("/etc/passwd", [stemBase, midiBase]),
    null,
  );
  assert.equal(
    resolvePathUnderAllowedBases(
      path.join(stemBase, "..", "..", "etc", "passwd"),
      [stemBase],
    ),
    null,
  );
});
