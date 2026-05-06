// @ts-check
import multer from "multer";
import path from "path";
import os from "os";
import { mkdir } from "fs/promises";

/** Temp dir for streaming uploads (one file per request; cleaned after proxy). */
export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

export const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/x-aac",
  "video/mp4", // some encoders tag m4a as video/mp4
]);

export const ALLOWED_AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
]);

// Stream uploads to disk (multer → UPLOAD_TMP_DIR under os.tmpdir()), not whole-file RAM buffering.
// Files are deleted after the split request finishes (success or error). S3 is used only for completed stem outputs when configured.
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) =>
      mkdir(UPLOAD_TMP_DIR, { recursive: true })
        .then(() => cb(null, UPLOAD_TMP_DIR))
        .catch(cb),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".wav";
      cb(
        null,
        `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`,
      );
    },
  }),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      !ALLOWED_AUDIO_EXTS.has(ext) ||
      !ALLOWED_AUDIO_MIMES.has(file.mimetype)
    ) {
      return cb(
        Object.assign(
          new Error(
            "Only audio files are accepted (mp3, wav, flac, ogg, m4a, aac).",
          ),
          { code: "INVALID_FILE_TYPE" },
        ),
      );
    }
    cb(null, true);
  },
});

export const MAX_UPLOAD_MB = Math.round(
  (Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024) / (1024 * 1024),
);
