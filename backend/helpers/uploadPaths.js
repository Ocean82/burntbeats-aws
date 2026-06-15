// @ts-check
/**
 * Canonical allowed roots for uploaded or staged audio read during request handling.
 * Centralizes path policy so uploadSniff, malwareScan, and routes stay consistent.
 */
import os from "os";
import path from "path";

import { UPLOAD_TMP_DIR } from "../middleware/upload.js";
import {
  assertPathUnderAllowedBases,
  isPathInsideBase,
  resolvePathUnderAllowedBases,
} from "./safePath.js";

/** Multer upload dir shared by stems, MIDI, and speech enhance routes. */
export const UPLOAD_PROCESSING_BASES = Object.freeze([UPLOAD_TMP_DIR]);

const STEM_TEMP_DIR_PREFIX = "burntbeats-stem-";

/**
 * Stem S3 fallback downloads land in mkdtemp("burntbeats-stem-*") under os.tmpdir().
 * @param {string} candidatePath
 * @returns {string | null}
 */
function resolveStemTempProcessingPath(candidatePath) {
  const resolved = resolvePathUnderAllowedBases(candidatePath, [os.tmpdir()]);
  if (!resolved) return null;

  const parentDir = path.dirname(resolved);
  const parentName = path.basename(parentDir);
  if (!parentName.startsWith(STEM_TEMP_DIR_PREFIX)) return null;
  if (!isPathInsideBase(parentDir, resolved)) return null;
  return resolved;
}

/**
 * Validate a path before reading uploaded or staged audio (sniff, scan, token metering).
 * @param {string} candidatePath
 * @returns {string | null}
 */
export function assertUploadProcessingPath(candidatePath) {
  const fromUploadDir = assertPathUnderAllowedBases(
    candidatePath,
    UPLOAD_PROCESSING_BASES,
  );
  if (fromUploadDir) return fromUploadDir;
  return resolveStemTempProcessingPath(candidatePath);
}
