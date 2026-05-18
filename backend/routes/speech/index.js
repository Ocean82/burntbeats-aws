// @ts-check
import { Router } from "express";

import { enhanceRouter } from "./enhance.js";
import { speechStatusRouter } from "./status.js";
import { speechFileRouter } from "./file-serve.js";

export const speechRouter = Router();

speechRouter.use("/enhance", enhanceRouter);
speechRouter.use("/status", speechStatusRouter);
speechRouter.use("/file", speechFileRouter);
