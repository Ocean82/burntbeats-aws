// @ts-check
/**
 * Audio file utilities for token cost computation.
 *
 * Reads audio duration from file metadata and finds job input files.
 */
import { readdirSync } from "fs";
import path from "path";
import { parseFile } from "music-metadata";

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
 * @param {string} jobDir absolute path to job folder (contains input.*)
 * @returns {string | null}
 */
export function findJobInputPath(jobDir) {
  try {
    const names = readdirSync(jobDir);
    const input = names.find((n) => n.startsWith("input."));
    return input ? path.join(jobDir, input) : null;
  } catch {
    return null;
  }
}
