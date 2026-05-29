// @ts-check
import { Router } from "express";

import { midiConvertRouter } from "./convert.js";
import { midiStatusRouter } from "./status.js";
import { midiFileRouter } from "./file-serve.js";
import { midiHistoryRouter } from "./history.js";
import { midiCleanupRouter } from "./cleanup.js";
import { midiMergeRouter } from "./merge.js";
import { midiExportRouter } from "./export.js";
import { midiWaveformRouter, midiSpectrumRouter } from "./waveform.js";
import { midiJobsRouter } from "./jobs.js";

export const midiRouter = Router();

midiRouter.use("/convert", midiConvertRouter);
midiRouter.use("/status", midiStatusRouter);
midiRouter.use("/file", midiFileRouter);
midiRouter.use("/history", midiHistoryRouter);
midiRouter.use("/cleanup", midiCleanupRouter);
midiRouter.use("/merge", midiMergeRouter);
midiRouter.use("/export", midiExportRouter);
midiRouter.use("/waveform", midiWaveformRouter);
midiRouter.use("/spectrum", midiSpectrumRouter);
midiRouter.use("/jobs", midiJobsRouter);
