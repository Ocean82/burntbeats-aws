// @ts-check
import path from "path";

import { UUID_REGEX } from "./validation.js";

/**
 * @param {string} segment
 * @returns {boolean}
 */
export function isSafePathSegment(segment) {
  if (typeof segment !== "string" || !segment) return false;
  if (segment === "." || segment === "..") return false;
  if (/[\0/\\]/.test(segment)) return false;
  return true;
}

/**
 * @param {string} baseDir
 * @param {string} candidatePath
 * @returns {boolean}
 */
export function isPathInsideBase(baseDir, candidatePath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  if (base === resolved) return true;
  const relative = path.relative(base, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Resolve a path under baseDir; returns null if traversal or unsafe segments.
 * @param {string} baseDir
 * @param {...string} segments
 * @returns {string | null}
 */
export function resolvePathWithinBase(baseDir, ...segments) {
  for (const segment of segments) {
    if (!isSafePathSegment(segment)) return null;
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...segments);
  if (!isPathInsideBase(base, resolved)) return null;
  return resolved;
}

/**
 * @param {string} baseDir
 * @param {string} jobId
 * @returns {string | null}
 */
export function resolveUuidJobDir(baseDir, jobId) {
  if (!jobId || !UUID_REGEX.test(jobId)) return null;
  return resolvePathWithinBase(baseDir, jobId);
}

/**
 * Resolve a filesystem path only when it stays under one of the allowed base dirs.
 * Use for optional client-supplied paths (e.g. mastering input_path).
 * @param {string} candidatePath
 * @param {readonly string[]} allowedBases
 * @returns {string | null}
 */
export function resolvePathUnderAllowedBases(candidatePath, allowedBases) {
  if (typeof candidatePath !== "string" || !candidatePath.trim()) return null;
  if (candidatePath.includes("\0")) return null;
  const resolved = path.resolve(candidatePath);
  for (const baseDir of allowedBases) {
    if (isPathInsideBase(baseDir, resolved)) return resolved;
  }
  return null;
}
