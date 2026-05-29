// @ts-check
/**
 * Shared FFmpeg spawn helpers for CPU-only audio processing routes.
 */
import { spawn } from "child_process";

/**
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ exitCode: number; stderr: string }>}
 */
export function runFfmpeg(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const bin = process.env.FFMPEG_BIN || "ffmpeg";

  return new Promise((resolve, reject) => {
    /** @type {string} */
    let stderr = "";
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg timed out"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stderr });
    });
  });
}
