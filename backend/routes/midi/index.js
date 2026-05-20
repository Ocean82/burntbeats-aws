// @ts-check
import { Router } from "express";

import { midiConvertRouter } from "./convert.js";
import { midiStatusRouter } from "./status.js";
import { midiFileRouter } from "./file-serve.js";

export const midiRouter = Router();

midiRouter.use("/convert", midiConvertRouter);
midiRouter.use("/status", midiStatusRouter);
midiRouter.use("/file", midiFileRouter);
