// @ts-check
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { resolvePathWithinBase, resolveUuidJobDir } from "../../helpers/safePath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Must match speech_service SPEECH_OUTPUT_DIR */
export const SPEECH_OUTPUT_DIR = path.resolve(
  process.env.SPEECH_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "..", "tmp", "speech"),
);

export const SPEECH_ACCEPT_TIMEOUT_MS =
  Number(process.env.SPEECH_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

/** Must match speech_service SPEECH_MAX_UPLOAD_MB (default 100). */
export const SPEECH_MAX_UPLOAD_BYTES =
  (Number(process.env.SPEECH_MAX_UPLOAD_MB) || 100) * 1024 * 1024;

export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-speech-upload");

/**
 * @param {string} jobId
 * @param {...string} segments
 * @returns {string | null}
 */
export function resolveSpeechJobPath(jobId, ...segments) {
  if (!resolveUuidJobDir(SPEECH_OUTPUT_DIR, jobId)) return null;
  return resolvePathWithinBase(SPEECH_OUTPUT_DIR, jobId, ...segments);
}
