// @ts-check
/**
 * Audio file utilities for token cost computation.
 *
 * Reads audio duration from file metadata and finds job input files.
 */
import { readdirSync } from "fs";
import path from "path";
import { parseFile } from "music-metadata";

import { isPathInsideBase, resolveUuidJobDir } from "../helpers/safePath.js";

/**
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds (from container; may be fractional)
 */
export async function getAudioDurationSeconds(filePath) {
  const meta = await parseFile(filePath);
  const d = meta.format.duration;
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0) {
    throw new Error("Could not read audio duration from file");
  }
  return d;
}

/**
 * @param {string} baseDir job output root (e.g. STEM_OUTPUT_DIR)
 * @param {string} jobId UUID job folder name
 * @returns {string | null}
 */
export function findJobInputPath(baseDir, jobId) {
  const jobDir = resolveUuidJobDir(baseDir, jobId);
  if (!jobDir) return null;
  try {
    const names = readdirSync(jobDir);
    const input = names.find((n) => n.startsWith("input."));
    if (!input) return null;
    const filePath = path.join(jobDir, input);
    if (!isPathInsideBase(jobDir, filePath)) return null;
    return filePath;
  } catch {
    return null;
  }
}
