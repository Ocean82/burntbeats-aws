// @ts-check
/**
 * Resolve stem WAV audio for server-side processing (MIDI convert, etc.).
 * Prefers local disk under STEM_OUTPUT_DIR; falls back to S3 when progress.json
 * has keys but local files were removed (S3_DELETE_LOCAL_AFTER_UPLOAD).
 */
import { createWriteStream, existsSync, readdirSync, readFileSync } from "fs";
import { mkdtemp, rmdir, unlink } from "fs/promises";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";

import { isSafePathSegment, resolvePathWithinBase } from "./safePath.js";
import { presignStemGetUrl as defaultPresignStemGetUrl } from "../s3Presign.js";
import { resolveStemJobPath } from "../routes/stems/shared.js";

/** @typedef {{ presignStemGetUrl: typeof defaultPresignStemGetUrl, fetchFn: typeof fetch }} ResolveStemAudioDeps */

function createDefaultDeps() {
  return {
    presignStemGetUrl: defaultPresignStemGetUrl,
    fetchFn: globalThis.fetch.bind(globalThis),
  };
}

/** @type {ResolveStemAudioDeps} */
let resolveStemAudioDeps = createDefaultDeps();

/** @param {Partial<ResolveStemAudioDeps>} overrides */
export function setResolveStemAudioDepsForTests(overrides) {
  resolveStemAudioDeps = { ...resolveStemAudioDeps, ...overrides };
}

export function resetResolveStemAudioDepsForTests() {
  resolveStemAudioDeps = createDefaultDeps();
}

/**
 * Resolve a stem WAV path on local disk only.
 * @param {string} stemJobId
 * @param {string} stemName
 * @returns {string | null}
 */
export function resolveStemPathLocal(stemJobId, stemName) {
  if (typeof stemName !== "string") return null;
  const trimmedStemName = stemName.trim();
  if (!trimmedStemName || !isSafePathSegment(trimmedStemName)) return null;

  try {
    const stemsDir = resolveStemJobPath(stemJobId, "stems");
    if (!stemsDir) return null;

    const entries = readdirSync(stemsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isSafePathSegment(entry.name)) continue;
      if (path.extname(entry.name).toLowerCase() !== ".wav") continue;
      if (path.basename(entry.name, ".wav") !== trimmedStemName) continue;
      const filePath = resolvePathWithinBase(stemsDir, entry.name);
      if (!filePath || !existsSync(filePath)) continue;
      return filePath;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} stemJobId
 * @param {string} stemName
 * @returns {Promise<{ bucket: string, key: string, region?: string } | null>}
 */
async function resolveStemS3Location(stemJobId, stemName) {
  const trimmedStemName = stemName.trim();
  if (!trimmedStemName || !isSafePathSegment(trimmedStemName)) return null;

  const progressPath = resolveStemJobPath(stemJobId, "progress.json");
  if (!progressPath || !existsSync(progressPath)) return null;

  try {
    const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
    const s3 = progress?.s3;
    if (!s3 || typeof s3.keys !== "object" || !s3.bucket) return null;
    const key = s3.keys[trimmedStemName];
    if (typeof key !== "string" || !key.trim()) return null;
    return { bucket: s3.bucket, key, region: s3.region };
  } catch {
    return null;
  }
}

/**
 * Download stem WAV from S3 to a temp file for downstream processing.
 * @param {string} stemJobId
 * @param {string} stemName
 * @returns {Promise<string | null>}
 */
async function fetchStemFromS3ToTemp(stemJobId, stemName) {
  const trimmedStemName = stemName.trim();
  if (!trimmedStemName || !isSafePathSegment(trimmedStemName)) return null;

  const location = await resolveStemS3Location(stemJobId, stemName);
  if (!location) return null;

  const { presignStemGetUrl, fetchFn } = resolveStemAudioDeps;

  try {
    const url = await presignStemGetUrl(
      location.bucket,
      location.key,
      location.region,
    );
    const s3Res = await fetchFn(url);
    if (!s3Res.ok || !s3Res.body) {
      console.warn(
        `[resolveStemAudio] S3 fetch failed for ${stemJobId}/${stemName}: ${s3Res.status}`,
      );
      return null;
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "burntbeats-stem-"));
    const tempPath = resolvePathWithinBase(tempDir, `${trimmedStemName}.wav`);
    if (!tempPath) return null;
    const { Readable } = await import("stream");
    const nodeStream = Readable.fromWeb(/** @type {any} */ (s3Res.body));
    await pipeline(nodeStream, createWriteStream(tempPath));
    return tempPath;
  } catch (err) {
    console.warn(
      "[resolveStemAudio] S3 download failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve stem audio for server-side use. Returns local path or temp download path.
 * @param {string} stemJobId
 * @param {string} stemName
 * @returns {Promise<{ filePath: string, isTempFile: boolean } | null>}
 */
export async function resolveStemAudioPath(stemJobId, stemName) {
  const localPath = resolveStemPathLocal(stemJobId, stemName);
  if (localPath) {
    return { filePath: localPath, isTempFile: false };
  }

  const tempPath = await fetchStemFromS3ToTemp(stemJobId, stemName);
  if (tempPath) {
    return { filePath: tempPath, isTempFile: true };
  }

  return null;
}

/**
 * Remove a temp stem file downloaded from S3 (including its parent temp dir when possible).
 * @param {string} filePath
 */
export async function cleanupTempStemFile(filePath) {
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    await unlink(filePath);
    await rmdir(dir).catch(() => {});
  } catch {
    /* best-effort */
  }
}
