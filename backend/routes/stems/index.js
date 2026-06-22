// @ts-check
/**
 * Stem routes — assembled from sub-modules.
 * Mounts: split, status, expand, server-export, file-serve, cleanup.
 *
 * Public exports: stemsRouter, STEM_OUTPUT_DIR (used by server.js startup).
 */
import { Router } from "express";

import { splitRouter } from "./split.js";
import { statusRouter } from "./status.js";
import { expandRouter } from "./expand.js";
import { serverExportRouter } from "./server-export.js";
import { fileServeRouter } from "./file-serve.js";
import { cleanupRouter } from "./cleanup.js";
import { uploadUrlRouter } from "./upload-url.js";
import { STEM_OUTPUT_DIR } from "./shared.js";

export const stemsRouter = Router();

// POST /api/stems/upload-url
stemsRouter.use("/upload-url", uploadUrlRouter);

// POST /api/stems/split
stemsRouter.use("/split", splitRouter);

// GET /api/stems/status/:job_id, GET /api/stems/status/:job_id/stream
stemsRouter.use("/status", statusRouter);

// POST /api/stems/expand
stemsRouter.use("/expand", expandRouter);

// POST /api/stems/server-export
stemsRouter.use("/server-export", serverExportRouter);

// POST /api/stems/cleanup, GET /api/stems/cleanup (405)
// Must be mounted before fileServeRouter to avoid DELETE /:job_id intercepting /cleanup.
stemsRouter.use("/cleanup", cleanupRouter);

// GET /api/stems/file/:job_id/:stemId, DELETE /api/stems/:job_id
stemsRouter.use("/", fileServeRouter);

export { STEM_OUTPUT_DIR };
