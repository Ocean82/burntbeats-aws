// @ts-check
/**
 * POST /server-export — Optional server-side master WAV render.
 * SERVER_EXPORT_ENABLED off → 404 JSON; on → streamed download (+ usage debit when USAGE_TOKENS_ENABLED).
 */
import { Router } from "express";
import { existsSync, unlink } from "fs";
import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

import { authMiddleware } from "../../middleware/auth.js";
import { serverExportRateLimitMiddleware } from "../../middleware/rateLimiter.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  computeServerExportCost,
  findJobInputPath,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  reserveUsageTokens,
  refundUsageTokens,
} from "../../usageTokens.js";

import { STEM_OUTPUT_DIR, usageErrorResponse } from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const serverExportRouter = Router();

serverExportRouter.post(
  "/",
  serverExportRateLimitMiddleware,
  authMiddleware,
  async (req, res) => {
    const enabled = ["1", "true", "yes"].includes(
      (process.env.SERVER_EXPORT_ENABLED || "").toLowerCase(),
    );
    if (!enabled) {
      return res.status(404).json({
        error:
          "Server-side export is not enabled. Use client-side master export (default) — see frontend useExport / docs/ARCHITECTURE-FLOW.md.",
      });
    }

    /** @type {{ job_id?: unknown; stem_ids?: unknown; stem_states?: unknown; upload_name?: unknown; normalize?: unknown }} */
    const body = req.body || {};
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!jobId || !UUID_REGEX.test(jobId)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing job_id (UUID)." });
    }

    const uploadNameRaw =
      typeof body.upload_name === "string" && body.upload_name
        ? body.upload_name
        : "upload";
    const uploadBaseName =
      uploadNameRaw
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .slice(0, 100) || "upload";

    const normalize = body.normalize === undefined ? true : !!body.normalize;

    const stemStates =
      (body.stem_states && typeof body.stem_states === "object"
        ? /** @type {any} */ (body.stem_states)
        : {}) || {};
    /** @type {string[]} */
    const stemIds = Array.isArray(body.stem_ids)
      ? body.stem_ids.filter((x) => typeof x === "string")
      : Object.keys(stemStates).filter((k) => typeof k === "string");

    // Solos override mutes (matches frontend filterStemsForAudibleMix).
    const anySolo = stemIds.some((id) => !!stemStates?.[id]?.soloed);
    const stemsToMix = stemIds.filter((id) => {
      const s = stemStates?.[id];
      if (!s || typeof s !== "object") return false;
      if (anySolo) return !!s.soloed;
      return !s.muted;
    });

    if (stemsToMix.length === 0) {
      return res.status(400).json({
        error: "No audible stems to export (all muted or missing stem state).",
      });
    }

    const stemStatesSubset = {};
    for (const id of stemsToMix) {
      if (stemStates?.[id]) stemStatesSubset[id] = stemStates[id];
    }

    // Charge usage tokens when enabled (same minute-basis as split/expand).
    let usageUserId = null;
    let usageCost = 0;
    let usageReserved = false;
    if (isUsageTokensEnabled()) {
      try {
        usageUserId = await verifyClerkBearer(req);
        const inputPath = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
        if (!inputPath) {
          return res.status(400).json({
            error:
              "Source input for job not found (cannot compute export cost).",
          });
        }
        const durationSec = await getAudioDurationSeconds(inputPath);
        usageCost = computeServerExportCost(durationSec);
        await reserveUsageTokens(usageUserId, usageCost);
        usageReserved = usageCost > 0;
      } catch (e) {
        const { status, message } = usageErrorResponse(
          e,
          "[POST /api/stems/server-export usage]",
          "Unable to verify your account. Please sign in again.",
          "Unable to reserve usage for export.",
        );
        return res.status(status).json({ error: message });
      }
    }

    const exportTmpDir = path.join(os.tmpdir(), "burntbeats-server-export");
    await mkdir(exportTmpDir, { recursive: true });

    const exportId = randomUUID();
    const exportOutPath = path.join(exportTmpDir, `${exportId}.wav`);
    const pyScriptPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "stem_service",
      "server_export.py",
    );

    /** @type {{ stem_ids: string[], stem_states: Record<string, any>, normalize: boolean }} */
    const pythonPayload = {
      stem_ids: stemsToMix,
      stem_states: stemStatesSubset,
      normalize,
    };

    const pyBin = process.env.PYTHON_BIN || "python";

    /** @type {string} */
    let stderrText = "";
    try {
      const child = spawn(
        pyBin,
        [
          pyScriptPath,
          "--job-id",
          jobId,
          "--output",
          exportOutPath,
          "--sample-rate",
          "44100",
        ],
        {
          env: { ...process.env, STEM_OUTPUT_DIR: STEM_OUTPUT_DIR },
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (d) => {
        stderrText += d;
      });

      child.stdin.write(JSON.stringify(pythonPayload));
      child.stdin.end();

      const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
      });

      if (exitCode !== 0) {
        console.error(
          "[POST /api/stems/server-export] python exit",
          exitCode,
          stderrText ? stderrText.split("\n").slice(-40).join("\n") : "",
        );
        return res.status(500).json({ error: "Server export render failed" });
      }

      if (!existsSync(exportOutPath)) {
        return res.status(500).json({
          error: "Server export completed but output file was not produced.",
        });
      }

      const downloadName = `${uploadBaseName}_master.wav`;
      res.setHeader("Content-Type", "audio/wav");
      return res.download(exportOutPath, downloadName, (err) => {
        // Best-effort cleanup of temp export file.
        unlink(exportOutPath, () => {});
        if (err)
          console.error(
            "[POST /api/stems/server-export] download error:",
            err.message,
          );
      });
    } catch (e) {
      if (usageReserved && usageUserId && usageCost > 0) {
        try {
          await refundUsageTokens(usageUserId, usageCost);
        } catch (refundErr) {
          console.error(
            "[POST /api/stems/server-export] usage refund failed:",
            refundErr,
          );
        }
      }
      try {
        unlink(exportOutPath, () => {});
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/stems/server-export] render exception:", msg);
      return res.status(500).json({ error: "Server export failed" });
    }
  },
);
