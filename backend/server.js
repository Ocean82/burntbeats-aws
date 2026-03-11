/**
 * Backend API: POST /api/stems/split (proxy to Python stem service), GET /api/stems/file/:job_id/:stemId (serve WAV).
 * Set STEM_SERVICE_URL (e.g. http://localhost:5000) and STEM_OUTPUT_DIR (shared with Python) in env.
 * Uploads are streamed to disk (no full-file buffer in memory); proxy to Python streams from disk.
 */
import cors from "cors";
import express from "express";
import FormData from "form-data";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlink,
} from "fs";
import { mkdir } from "fs/promises";
import multer from "multer";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const STEM_SERVICE_URL = process.env.STEM_SERVICE_URL || "http://localhost:5000";
// Must match stem_service OUTPUT_BASE (Python STEM_OUTPUT_DIR). Same path so GET /api/stems/file can serve files Python wrote.
const STEM_OUTPUT_DIR = path.resolve(process.env.STEM_OUTPUT_DIR || path.join(__dirname, "..", "tmp", "stems"));

// Temp dir for streaming uploads (one file per request; cleaned after proxy).
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

// Path traversal hardening: allowlist only (Python uses UUID4 for job_id; stem ids are fixed set)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STEM_IDS = new Set(["vocals", "drums", "bass", "other", "instrumental"]);

function validateStemFileParams(jobId, stemIdParam) {
  if (!jobId || !UUID_REGEX.test(jobId)) return { ok: false, stemId: null };
  const raw = stemIdParam.replace(/\.wav$/i, "");
  if (!raw || !ALLOWED_STEM_IDS.has(raw)) return { ok: false, stemId: null };
  return { ok: true, stemId: `${raw}.wav` };
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Stream uploads to disk so we never hold a full large file in memory; proxy then streams from file to Python.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => mkdir(UPLOAD_TMP_DIR, { recursive: true }).then(() => cb(null, UPLOAD_TMP_DIR)).catch(cb),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".wav";
      cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// Short timeout for POST: we only wait for 202 + job_id; separation runs in background
const SPLIT_ACCEPT_TIMEOUT_MS = Number(process.env.SPLIT_ACCEPT_TIMEOUT_MS) || 30_000;

app.post("/api/stems/split", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }
  const filePath = req.file.path;
  const stems = (req.body && req.body.stems) || "4";
  const quality = req.body && req.body.quality;

  // Stream from disk to Python (no full-file buffer in memory)
  const form = new FormData();
  form.append("file", createReadStream(filePath), {
    filename: req.file.originalname || "audio.wav",
  });
  form.append("stems", stems);
  if (quality) form.append("quality", quality);

  try {
    const r = await fetch(`${STEM_SERVICE_URL}/split`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(SPLIT_ACCEPT_TIMEOUT_MS),
      duplex: "half",
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: t || r.statusText });
    }
    const data = await r.json();
    if (r.status === 202) {
      return res.status(202).json({ job_id: data.job_id, status: data.status ?? "accepted" });
    }
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    data.stems = (data.stems || []).map((s) => ({
      id: s.id,
      url: `${baseUrl}/api/stems/file/${data.job_id}/${s.id}.wav`,
      path: s.path,
    }));
    res.json(data);
  } catch (e) {
    const err = e && typeof e === "object" ? e : { name: "", message: String(e) };
    console.error("[POST /api/stems/split] proxy error:", err.name, err.message, err.cause ?? "");
    const message =
      err.name === "TimeoutError"
        ? "Stem service did not accept in time (check stem service is running)"
        : "Stem service unavailable (ensure stem service runs on port 5000; try STEM_SERVICE_URL=http://127.0.0.1:5000)";
    res.status(502).json({ error: message });
  } finally {
    unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("[POST /api/stems/split] cleanup temp file:", unlinkErr.message);
    });
  }
});

app.get("/api/stems/status/:job_id", (req, res) => {
  const { job_id } = req.params;
  if (!job_id || !UUID_REGEX.test(job_id)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
  if (!existsSync(progressPath)) {
    return res.status(404).json({ error: "Job not found" });
  }
  let data;
  try {
    data = JSON.parse(readFileSync(progressPath, "utf-8"));
  } catch {
    return res.status(404).json({ error: "Job not found" });
  }
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  if (data.stems && Array.isArray(data.stems)) {
    data.stems = data.stems.map((s) => ({
      id: s.id,
      url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
      path: s.path,
    }));
  }
  res.json(data);
});

app.get("/api/stems/file/:job_id/:stemId", (req, res) => {
  const { job_id, stemId } = req.params;
  const validated = validateStemFileParams(job_id, stemId);
  if (!validated.ok) {
    return res.status(400).json({ error: "Invalid job_id or stem id" });
  }
  const filePath = path.join(STEM_OUTPUT_DIR, job_id, "stems", validated.stemId);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Stem file not found" });
  }
  res.setHeader("Content-Type", "audio/wav");
  createReadStream(filePath).pipe(res);
});

app.get("/api/stems/cleanup", (req, res) => {
  const maxAgeHours = Math.max(0, Number(req.query.maxAgeHours) || 24);
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = readdirSync(STEM_OUTPUT_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!UUID_REGEX.test(ent.name)) continue;
      const dirPath = path.join(STEM_OUTPUT_DIR, ent.name);
      const stat = statSync(dirPath);
      if (stat.mtime.getTime() < cutoff) {
        rmSync(dirPath, { recursive: true });
        deleted++;
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    console.error("[cleanup]", e);
    return res.status(500).json({ error: "Cleanup failed" });
  }
  res.json({ deleted, maxAgeHours });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", stem_output_dir: STEM_OUTPUT_DIR });
});

const PORT = Number(process.env.PORT) || 3001;
async function main() {
  await mkdir(STEM_OUTPUT_DIR, { recursive: true });
  await mkdir(UPLOAD_TMP_DIR, { recursive: true });
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(`STEM_SERVICE_URL=${STEM_SERVICE_URL} STEM_OUTPUT_DIR=${STEM_OUTPUT_DIR}`);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
