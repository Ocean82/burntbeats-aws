// @ts-check
/**
 * Magic-byte sniffing for uploads: extension + browser MIME are spoofable; verify
 * the file header matches the declared audio type before further processing.
 */
import { openSync, readSync, closeSync } from "fs";

const HEADER_BYTES = 4096;
/** Reject absurd ID3 size claims (mitigate header DoS). */
const MAX_ID3_SYNTHETIC = 256 * 1024;

/**
 * @param {string} filePath
 * @param {string} extWithDot e.g. ".wav" (from originalname, lowercased)
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function verifyUploadMatchesExtension(filePath, extWithDot) {
  const ext = extWithDot.toLowerCase();
  if (!ext || ext === ".") {
    return { ok: false, message: "Missing or invalid file extension." };
  }

  /** @type {number | undefined} */
  let fd;
  try {
    fd = openSync(filePath, "r");
    const buf = Buffer.allocUnsafe(HEADER_BYTES);
    const n = readSync(fd, buf, 0, HEADER_BYTES, 0);
    if (n < 4) {
      return { ok: false, message: "File is empty or too small to be audio." };
    }
    const slice = buf.subarray(0, n);
    return sniffMatchesExt(slice, ext);
  } catch {
    return { ok: false, message: "Could not read uploaded file." };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {Buffer} buf
 * @param {string} ext
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function sniffMatchesExt(buf, ext) {
  if (ext === ".wav") {
    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      return { ok: true };
    }
    return { ok: false, message: "File does not look like a valid WAV file." };
  }
  if (ext === ".flac") {
    if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "fLaC") return { ok: true };
    return { ok: false, message: "File does not look like a valid FLAC file." };
  }
  if (ext === ".ogg") {
    if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS") return { ok: true };
    return { ok: false, message: "File does not look like a valid OGG file." };
  }
  if (ext === ".mp3") {
    if (looksLikeMp3(buf)) return { ok: true };
    return { ok: false, message: "File does not look like a valid MP3 file." };
  }
  if (ext === ".m4a" || ext === ".aac") {
    if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") return { ok: true };
    // ADTS AAC sync word
    if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return { ok: true };
    return { ok: false, message: "File does not look like a valid M4A/AAC file." };
  }
  return { ok: true };
}

/**
 * @param {Buffer} buf
 * @returns {boolean}
 */
function looksLikeMp3(buf) {
  let i = 0;
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "ID3") {
    const id3len =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    if (id3len > MAX_ID3_SYNTHETIC) return false;
    i = 10 + id3len;
  }
  if (i >= buf.length - 1) return false;
  const b0 = buf[i];
  const b1 = buf[i + 1];
  return b0 === 0xff && (b1 & 0xe0) === 0xe0;
}
