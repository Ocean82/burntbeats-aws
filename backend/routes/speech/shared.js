// @ts-check
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Must match speech_service SPEECH_OUTPUT_DIR */
export const SPEECH_OUTPUT_DIR = path.resolve(
  process.env.SPEECH_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "..", "tmp", "speech"),
);

export const SPEECH_ACCEPT_TIMEOUT_MS =
  Number(process.env.SPEECH_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-speech-upload");
