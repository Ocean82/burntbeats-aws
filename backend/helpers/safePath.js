// @ts-check
import { lstatSync, realpathSync } from "fs";
import path from "path";

import { UUID_REGEX } from "./validation.js";

/**
 * @param {string} filePath
 * @returns {string}
 */
function canonicalizePath(filePath) {
  try {
    return realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/**
 * Canonicalize a base directory. Uses realpath when the directory exists so
 * logical joins cannot be fooled by symlinks on the base path itself.
 * @param {string} baseDir
 * @returns {string}
 */
function canonicalizeBaseDir(baseDir) {
  try {
    return realpathSync.native(baseDir);
  } catch {
    return path.resolve(baseDir);
  }
}

/**
 * @param {string} segment
 * @returns {boolean}
 */
export function isSafePathSegment(segment) {
  if (typeof segment !== "string" || !segment) return false;
  if (segment === "." || segment === "..") return false;
  if (path.isAbsolute(segment)) return false;
  if (/[\0/\\]/.test(segment)) return false;
  return true;
}

/**
 * @param {string} baseDir
 * @param {string} candidatePath
 * @returns {boolean}
 */
export function isPathInsideBase(baseDir, candidatePath) {
  const base = canonicalizeBaseDir(baseDir);
  const resolved = path.resolve(candidatePath);
  if (resolved === base) return true;
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  return resolved.startsWith(prefix);
}

/**
 * Reject symlink hops in path components that already exist. Missing trailing
 * components are allowed so callers can create new files safely.
 * @param {string} canonicalBase
 * @param {string} targetPath
 * @returns {boolean}
 */
function hasSymlinkInExistingPrefix(canonicalBase, targetPath) {
  const resolved = path.resolve(targetPath);
  if (!isPathInsideBase(canonicalBase, resolved)) return true;

  const relative = path.relative(canonicalBase, resolved);
  if (!relative || relative === ".") return false;

  const parts = relative.split(path.sep).filter(Boolean);
  let current = canonicalBase;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code === "ENOENT") return false;
      return true;
    }
  }
  return false;
}

/**
 * When the target already exists, ensure its canonical location stays inside base.
 * @param {string} canonicalBase
 * @param {string} targetPath
 * @returns {boolean}
 */
function existingTargetEscapesBase(canonicalBase, targetPath) {
  try {
    const canonicalTarget = realpathSync.native(targetPath);
    return !isPathInsideBase(canonicalBase, canonicalTarget);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    return code !== "ENOENT";
  }
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
  const base = canonicalizeBaseDir(baseDir);
  const resolved = path.resolve(base, ...segments);
  if (!isPathInsideBase(base, resolved)) return null;
  if (hasSymlinkInExistingPrefix(base, resolved)) return null;
  if (existingTargetEscapesBase(base, resolved)) return null;
  return resolved;
}

/**
 * Resolve an existing path under baseDir and return its canonical realpath.
 * @param {string} baseDir
 * @param {...string} segments
 * @returns {string | null}
 */
export function resolveExistingPathWithinBase(baseDir, ...segments) {
  const logical = resolvePathWithinBase(baseDir, ...segments);
  if (!logical) return null;
  try {
    return realpathSync.native(logical);
  } catch {
    return null;
  }
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
  if (/(^|[\\/])\.\.([\\/]|$)/.test(candidatePath)) return null;
  const resolved = canonicalizePath(candidatePath);
  for (const baseDir of allowedBases) {
    const base = canonicalizeBaseDir(baseDir);
    if (isPathInsideBase(base, resolved)) return resolved;
  }
  return null;
}

/**
 * Validate an existing filesystem path against allowed base directories.
 * @param {string} candidatePath
 * @param {readonly string[]} allowedBases
 * @returns {string | null}
 */
export function assertPathUnderAllowedBases(candidatePath, allowedBases) {
  return resolvePathUnderAllowedBases(candidatePath, allowedBases);
}
