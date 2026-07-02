// @ts-check
/**
 * Shared constants and helpers for MIDI route modules.
 */
import { constants as fsConstants } from "fs";
import path from "path";
import { access, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "fs/promises";
import { fileURLToPath } from "url";

import { resolvePathWithinBase, resolveUuidJobDir } from "../../helpers/safePath.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
} from "../../usageTokens.js";
import {
  publicErrorMessage,
  sanitizedProxyClientError,
} from "../../clientSafeError.js";
import { isProxyHttpError } from "../../middleware/proxy.js";
import { DEV_BYPASS_UPLOAD_AUTH } from "../../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Output directory for MIDI files — must match midi_service MIDI_OUTPUT_DIR. */
export const MIDI_OUTPUT_DIR = path.resolve(
  process.env.MIDI_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "..", "tmp", "midi"),
);

/** Time to wait for MIDI service to accept the job (202). */
export const MIDI_ACCEPT_TIMEOUT_MS =
  Number(process.env.MIDI_ACCEPT_TIMEOUT_MS) || 120_000;

/** MIDI service base URL. */
export const MIDI_SERVICE_URL =
  process.env.MIDI_SERVICE_URL || "http://127.0.0.1:5002";

/** MIDI service API token for service-to-service auth. */
export const MIDI_SERVICE_API_TOKEN = process.env.MIDI_SERVICE_API_TOKEN || "";

/** Token cost for a single MIDI conversion. */
export const MIDI_TOKEN_COST = Math.ceil(
  Number(process.env.MIDI_TOKEN_COST) || 1,
);

/** Must match midi_service MIDI_MAX_UPLOAD_MB (default 100). */
export const MIDI_MAX_UPLOAD_BYTES =
  (Number(process.env.MIDI_MAX_UPLOAD_MB) || 100) * 1024 * 1024;

/** Default age for cleanup endpoint when `maxAgeHours` query is omitted */
export const MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS = (() => {
  const raw = Number(process.env.MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 24;
})();

export const MIDI_METADATA_FILENAME = "metadata.json";
export const MIDI_OUTPUT_FILENAME = "output.mid";
export const MIDI_STORAGE_SENTINEL_FILENAME = ".midi-service-storage.json";

/**
 * @param {string | undefined | null} jobId
 * @returns {boolean}
 */
export function isValidMidiJobId(jobId) {
  return !!jobId && /^[0-9a-f-]{36}$/i.test(jobId);
}

/**
 * Resolve a path under MIDI_OUTPUT_DIR with path-traversal protection.
 * @param {string} jobId
 * @param {string} filename
 * @returns {string | null}
 */
export function resolveMidiJobPath(jobId, filename) {
  if (!isValidMidiJobId(jobId)) return null;
  return resolvePathWithinBase(MIDI_OUTPUT_DIR, jobId, filename);
}

const INPUT_AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".flac",
  ".m4a",
  ".ogg",
  ".webm",
  ".aac",
]);

/** @param {string} ext */
export function mimeTypeForInputAudio(ext) {
  switch (ext.toLowerCase()) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".flac":
      return "audio/flac";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    case ".aac":
      return "audio/aac";
    default:
      return "application/octet-stream";
  }
}

/**
 * Resolve the uploaded source audio for a conversion job (input.*).
 * @param {string} jobId
 * @returns {Promise<string | null>}
 */
export async function resolveMidiJobInputPath(jobId) {
  if (!isValidMidiJobId(jobId)) return null;
  const jobDir = resolveUuidJobDir(MIDI_OUTPUT_DIR, jobId);
  if (!jobDir) return null;
  let entries;
  try {
    entries = await readdir(jobDir);
  } catch {
    return null;
  }
  const inputName = entries.find((name) => name.startsWith("input."));
  if (!inputName) return null;
  const ext = path.extname(inputName).toLowerCase();
  if (!INPUT_AUDIO_EXTENSIONS.has(ext)) return null;
  return resolvePathWithinBase(MIDI_OUTPUT_DIR, jobId, inputName);
}

/**
 * @param {string} jobId
 * @returns {Promise<any | null>}
 */
export async function readMidiJobMetadata(jobId) {
  const metaPath = resolveMidiJobPath(jobId, MIDI_METADATA_FILENAME);
  if (!metaPath) return null;
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
export async function midiOutputExists(jobId) {
  const filePath = resolveMidiJobPath(jobId, MIDI_OUTPUT_FILENAME);
  if (!filePath) return false;
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve the authenticated Clerk user for this request.
 * Allows tests to inject a verifier via app.locals.verifyClerkBearer.
 * @param {import("express").Request} req
 * @returns {Promise<string>}
 */
export async function verifyMidiOwner(req) {
  const testVerifier = req.app?.locals?.verifyClerkBearer;
  if (typeof testVerifier === "function") {
    return await testVerifier(req);
  }
  return await verifyClerkBearer(req);
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe backend access to the shared MIDI output directory.
 * @param {{ createIfMissing?: boolean }} [options]
 * @returns {Promise<{
 *   ok: boolean;
 *   output_dir: string;
 *   resolved_output_dir: string;
 *   can_read: boolean;
 *   can_write: boolean;
 *   error?: string;
 * }>}
 */
export async function probeMidiStorage(options = {}) {
  const outputDir = path.resolve(MIDI_OUTPUT_DIR);
  const createIfMissing = options.createIfMissing === true;

  try {
    if (createIfMissing) {
      await mkdir(outputDir, { recursive: true });
    }

    const dirStat = await stat(outputDir);
    if (!dirStat.isDirectory()) {
      return {
        ok: false,
        output_dir: outputDir,
        resolved_output_dir: outputDir,
        can_read: false,
        can_write: false,
        error: "MIDI output path is not a directory",
      };
    }

    const resolved = await realpath(outputDir).catch(() => outputDir);
    const canRead = await access(outputDir, fsConstants.R_OK)
      .then(() => true)
      .catch(() => false);
    const canWrite = await access(outputDir, fsConstants.W_OK)
      .then(() => true)
      .catch(() => false);

    if (!canWrite) {
      return {
        ok: false,
        output_dir: outputDir,
        resolved_output_dir: resolved,
        can_read: canRead,
        can_write: canWrite,
        error: "Backend cannot write to MIDI output directory",
      };
    }

    const probePath = resolvePathWithinBase(
      outputDir,
      `.backend-midi-probe-${process.pid}.tmp`,
    );
    if (!probePath) {
      return {
        ok: false,
        output_dir: outputDir,
        resolved_output_dir: resolved,
        can_read: canRead,
        can_write: canWrite,
        error: "Invalid probe path",
      };
    }
    await writeFile(probePath, "ok", "utf-8");
    await rm(probePath, { force: true });

    return {
      ok: canRead && canWrite,
      output_dir: outputDir,
      resolved_output_dir: resolved,
      can_read: canRead,
      can_write: canWrite,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      output_dir: outputDir,
      resolved_output_dir: outputDir,
      can_read: false,
      can_write: false,
      error: message,
    };
  }
}

/**
 * Compare backend and midi_service storage diagnostics.
 * Different containers may mount the same shared directory at different paths,
 * so alignment uses the service-written sentinel file rather than path equality.
 * @param {Awaited<ReturnType<typeof probeMidiStorage>>} backendStorage
 * @param {any} midiServiceHealth
 */
export async function getMidiSharedStorageHealth(backendStorage, midiServiceHealth) {
  const serviceStorage = midiServiceHealth?.storage || null;
  const sentinelFilename =
    typeof serviceStorage?.sentinel_filename === "string"
      ? serviceStorage.sentinel_filename
      : MIDI_STORAGE_SENTINEL_FILENAME;
  const sentinelPath = resolvePathWithinBase(
    MIDI_OUTPUT_DIR,
    sentinelFilename,
  );
  const sentinelVisible =
    backendStorage.ok &&
    sentinelPath !== null &&
    (await pathExists(sentinelPath));

  const aligned = Boolean(
    backendStorage.ok && serviceStorage?.ok === true && sentinelVisible,
  );

  return {
    aligned,
    service_sentinel_visible: sentinelVisible,
    sentinel_filename: sentinelFilename,
    reason: aligned
      ? null
      : "Backend could not confirm the midi_service storage sentinel on the shared MIDI volume.",
  };
}

/**
 * Attach MIDI service auth header when token protection is enabled.
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
export function withMidiServiceAuthHeader(headers) {
  if (!MIDI_SERVICE_API_TOKEN) return headers;
  return { ...headers, "X-Midi-Service-Token": MIDI_SERVICE_API_TOKEN };
}

/**
 * Handle a proxy error with optional usage refund.
 * @param {unknown} e
 * @param {import("express").Response} res
 * @param {string} logPrefix
 * @param {{ usageReserved: boolean; usageUserId: string | null; usageCost: number }} usage
 */
export async function handleMidiProxyError(e, res, logPrefix, usage) {
  if (usage.usageReserved && usage.usageUserId && usage.usageCost > 0) {
    try {
      await refundUsageTokens(usage.usageUserId, usage.usageCost);
    } catch (refundErr) {
      console.error(`${logPrefix} usage refund failed:`, refundErr);
    }
  }
  if (isProxyHttpError(e)) {
    console.warn(`${logPrefix} MIDI service error:`, e.statusCode, e.error);
    return res
      .status(e.statusCode)
      .json({ error: sanitizedProxyClientError(e.statusCode, e.error) });
  }
  const err = e && typeof e === "object" ? e : { name: "", message: String(e) };
  console.error(
    `${logPrefix} proxy error:`,
    err.name,
    err.message,
    err.cause ?? "",
  );
  const message =
    err.name === "TimeoutError" || err.message === "TimeoutError"
      ? "MIDI service did not respond in time (check midi_service is running)"
      : "MIDI service unavailable (ensure midi_service runs on port 5002)";
  return res.status(502).json({ error: message });
}

// Re-export commonly used items
export {
  verifyClerkBearer,
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
  publicErrorMessage,
  sanitizedProxyClientError,
  isProxyHttpError,
  DEV_BYPASS_UPLOAD_AUTH,
};
