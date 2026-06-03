// @ts-check
/**
 * Database Backup Service for BurntBeats
 *
 * Automated PostgreSQL backup with:
 * - pg_dump to local file (compressed)
 * - Upload to S3 for durability
 * - Retention policy (max backups + age-based cleanup)
 * - Backup history tracking
 *
 * Usage:
 *   node backend/services/db-backup.js              # run a single backup
 *   node backend/services/db-backup.js --schedule   # start scheduled backups (24h interval)
 *   node backend/services/db-backup.js --list       # list existing backups
 *   node backend/services/db-backup.js --restore <backup-id>  # restore from backup
 *
 * Environment:
 *   DATABASE_URL          — PostgreSQL connection string (required)
 *   DB_BACKUP_ENABLED     — "true" to enable (default: true)
 *   DB_BACKUP_PATH        — local backup directory (default: ./backups)
 *   DB_BACKUP_RETENTION_DAYS — days to keep backups (default: 30)
 *   DB_BACKUP_MAX_COUNT   — max backups to retain (default: 10)
 *   DB_BACKUP_S3_ENABLED  — "true" to upload backups to S3 (default: true)
 *   S3_BUCKET             — S3 bucket for backup storage
 *   S3_REGION             — S3 region (default: us-east-1)
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { resolvePathWithinBase } from "../helpers/safePath.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, "..", ".env");
  const lines = (await fs.readFile(envPath, "utf-8")).split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found — rely on environment */ }

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  enabled: process.env.DB_BACKUP_ENABLED !== "false",
  backupPath: process.env.DB_BACKUP_PATH || path.join(__dirname, "..", "backups"),
  retentionDays: parseInt(process.env.DB_BACKUP_RETENTION_DAYS || "30", 10),
  maxBackups: parseInt(process.env.DB_BACKUP_MAX_COUNT || "10", 10),
  s3Enabled: process.env.DB_BACKUP_S3_ENABLED !== "false",
  s3Bucket: process.env.S3_BUCKET || "burntbeatz2-storage",
  s3Region: process.env.S3_REGION || process.env.AWS_REGION || "us-east-1",
  s3Prefix: "backups/db",
  databaseUrl: process.env.DATABASE_URL || "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(emoji, msg) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  console.log(`[${ts}] ${emoji} ${msg}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

async function loadHistory() {
  try {
    const historyFile = path.join(CONFIG.backupPath, "backup-history.json");
    const data = await fs.readFile(historyFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveHistory(backups) {
  await fs.mkdir(CONFIG.backupPath, { recursive: true });
  const historyFile = path.join(CONFIG.backupPath, "backup-history.json");
  await fs.writeFile(historyFile, JSON.stringify(backups, null, 2));
}

// ── Core Backup ──────────────────────────────────────────────────────────────

async function createBackup() {
  if (!CONFIG.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const timestamp = new Date();
  const dateStr = timestamp.toISOString().slice(0, 10);
  const timeStr = timestamp.toISOString().slice(11, 19).replace(/:/g, "");
  const backupId = `backup-${dateStr}-${timeStr}`;
  const filename = `burntbeats-${dateStr}-${timeStr}.sql.gz`;
  const backupFilePath = path.join(CONFIG.backupPath, filename);

  log("🔄", `Creating backup: ${filename}`);

  await fs.mkdir(CONFIG.backupPath, { recursive: true });

  // Parse DATABASE_URL
  const url = new URL(CONFIG.databaseUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const database = url.pathname.slice(1).split("?")[0];
  const username = url.username;
  const password = decodeURIComponent(url.password);

  // Build pg_dump command with gzip compression
  const pgDumpCmd = `PGPASSWORD='${password}' pg_dump -h ${host} -p ${port} -U ${username} -d ${database} --no-owner --no-acl | gzip > "${backupFilePath}"`;

  const startTime = Date.now();

  try {
    await execAsync(pgDumpCmd, { shell: "/bin/bash", timeout: 120_000 });
  } catch (err) {
    // Try without gzip if gzip not available
    const plainFilename = filename.replace(".gz", "");
    const plainPath = path.join(CONFIG.backupPath, plainFilename);
    const plainCmd = `PGPASSWORD='${password}' pg_dump -h ${host} -p ${port} -U ${username} -d ${database} --no-owner --no-acl -f "${plainPath}"`;
    await execAsync(plainCmd, { shell: "/bin/bash", timeout: 120_000 });
    // Update filename reference
    const stats = await fs.stat(plainPath);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log("✓", `Backup completed (uncompressed): ${plainFilename} (${formatBytes(stats.size)}) in ${elapsed}s`);

    const backupRecord = {
      id: backupId,
      filename: plainFilename,
      timestamp: timestamp.toISOString(),
      size: stats.size,
      status: "completed",
      s3Key: null,
    };

    if (CONFIG.s3Enabled) {
      backupRecord.s3Key = await uploadToS3(plainPath, plainFilename);
    }

    const history = await loadHistory();
    history.unshift(backupRecord);
    await saveHistory(history);
    await cleanupOldBackups(history);
    return backupRecord;
  }

  const stats = await fs.stat(backupFilePath);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log("✓", `Backup completed: ${filename} (${formatBytes(stats.size)}) in ${elapsed}s`);

  const backupRecord = {
    id: backupId,
    filename,
    timestamp: timestamp.toISOString(),
    size: stats.size,
    status: "completed",
    s3Key: null,
  };

  // Upload to S3
  if (CONFIG.s3Enabled) {
    backupRecord.s3Key = await uploadToS3(backupFilePath, filename);
  }

  // Update history
  const history = await loadHistory();
  history.unshift(backupRecord);
  await saveHistory(history);

  // Cleanup old backups
  await cleanupOldBackups(history);

  return backupRecord;
}

// ── S3 Upload ────────────────────────────────────────────────────────────────

async function uploadToS3(filePath, filename) {
  const s3Key = `${CONFIG.s3Prefix}/${filename}`;
  const s3Uri = `s3://${CONFIG.s3Bucket}/${s3Key}`;

  try {
    log("☁️", `Uploading to ${s3Uri}...`);
    await execAsync(
      `aws s3 cp "${filePath}" "${s3Uri}" --region ${CONFIG.s3Region}`,
      { timeout: 120_000 },
    );
    log("✓", `Uploaded to S3: ${s3Uri}`);
    return s3Key;
  } catch (err) {
    log("⚠️", `S3 upload failed (backup still saved locally): ${err.message || err}`);
    return null;
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupOldBackups(history) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.retentionDays);

  let removed = 0;

  // Remove by age
  for (const backup of history) {
    if (new Date(backup.timestamp) < cutoffDate) {
      await removeBackupFile(backup);
      removed++;
    }
  }

  // Remove by count (keep only maxBackups)
  const completed = history.filter((b) => b.status === "completed");
  if (completed.length > CONFIG.maxBackups) {
    const excess = completed.slice(CONFIG.maxBackups);
    for (const backup of excess) {
      await removeBackupFile(backup);
      removed++;
    }
  }

  // Update history (keep only valid entries)
  const validIds = new Set(
    history
      .filter((b) => new Date(b.timestamp) >= cutoffDate)
      .slice(0, CONFIG.maxBackups)
      .map((b) => b.id),
  );
  const cleaned = history.filter((b) => validIds.has(b.id));
  await saveHistory(cleaned);

  if (removed > 0) {
    log("🗑️", `Cleaned up ${removed} old backup(s)`);
  }
}

const BACKUP_FILENAME_REGEX = /^burntbeats-\d{4}-\d{2}-\d{2}-\d{6}\.sql(\.gz)?$/;

async function removeBackupFile(backup) {
  try {
    const filename =
      typeof backup.filename === "string" ? backup.filename : "";
    if (!BACKUP_FILENAME_REGEX.test(filename)) return;
    const filePath = resolvePathWithinBase(CONFIG.backupPath, filename);
    if (!filePath) return;
    await fs.unlink(filePath);
  } catch { /* file may already be gone */ }

  // Also remove from S3 if it was uploaded
  if (backup.s3Key) {
    try {
      await execAsync(
        `aws s3 rm "s3://${CONFIG.s3Bucket}/${backup.s3Key}" --region ${CONFIG.s3Region}`,
        { timeout: 30_000 },
      );
    } catch { /* best effort */ }
  }
}

// ── Restore ──────────────────────────────────────────────────────────────────

async function restoreFromBackup(backupId) {
  const history = await loadHistory();
  const backup = history.find((b) => b.id === backupId);

  if (!backup) throw new Error(`Backup not found: ${backupId}`);
  if (backup.status !== "completed") throw new Error(`Cannot restore incomplete backup: ${backupId}`);

  const filename =
    typeof backup.filename === "string" ? backup.filename : "";
  if (!BACKUP_FILENAME_REGEX.test(filename)) {
    throw new Error(`Invalid backup filename: ${backup.id}`);
  }
  const filePath = resolvePathWithinBase(CONFIG.backupPath, filename);
  if (!filePath) {
    throw new Error(`Invalid backup path: ${backup.id}`);
  }

  // If local file doesn't exist, try downloading from S3
  try {
    await fs.access(filePath);
  } catch {
    if (!backup.s3Key) throw new Error(`Backup file not found locally and no S3 key: ${backup.filename}`);
    log("☁️", `Downloading backup from S3...`);
    await execAsync(
      `aws s3 cp "s3://${CONFIG.s3Bucket}/${backup.s3Key}" "${filePath}" --region ${CONFIG.s3Region}`,
      { timeout: 120_000 },
    );
  }

  log("🔄", `Restoring from: ${backup.filename}`);

  const url = new URL(CONFIG.databaseUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const database = url.pathname.slice(1).split("?")[0];
  const username = url.username;
  const password = decodeURIComponent(url.password);

  let restoreCmd;
  if (backup.filename.endsWith(".gz")) {
    restoreCmd = `PGPASSWORD='${password}' gunzip -c "${filePath}" | psql -h ${host} -p ${port} -U ${username} -d ${database} --quiet`;
  } else {
    restoreCmd = `PGPASSWORD='${password}' psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${filePath}" --quiet`;
  }

  await execAsync(restoreCmd, { shell: "/bin/bash", timeout: 300_000 });
  log("✓", `Restore completed from: ${backup.filename}`);
}

// ── List ─────────────────────────────────────────────────────────────────────

async function listBackups() {
  const history = await loadHistory();
  if (history.length === 0) {
    log("📋", "No backups found.");
    return;
  }

  console.log("\n  ID                          | Date                | Size      | S3");
  console.log("  " + "─".repeat(80));
  for (const b of history) {
    const date = new Date(b.timestamp).toISOString().slice(0, 19).replace("T", " ");
    const size = formatBytes(b.size).padEnd(9);
    const s3 = b.s3Key ? "✓" : "—";
    console.log(`  ${b.id.padEnd(29)} | ${date} | ${size} | ${s3}`);
  }
  console.log(`\n  Total: ${history.length} backup(s)\n`);
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--list")) {
  await listBackups();
} else if (args.includes("--restore")) {
  const idx = args.indexOf("--restore");
  const backupId = args[idx + 1];
  if (!backupId) {
    console.error("Usage: node db-backup.js --restore <backup-id>");
    process.exit(1);
  }
  await restoreFromBackup(backupId);
} else if (args.includes("--schedule")) {
  log("🔄", `Starting scheduled backup service (every 24h, retention: ${CONFIG.retentionDays} days, max: ${CONFIG.maxBackups})`);
  await createBackup();
  setInterval(async () => {
    try {
      await createBackup();
    } catch (err) {
      log("❌", `Scheduled backup failed: ${err.message || err}`);
    }
  }, 24 * 60 * 60 * 1000);
} else {
  // Single backup run
  try {
    const result = await createBackup();
    log("🎉", `Backup complete: ${result.filename} (${formatBytes(result.size)})`);
    process.exit(0);
  } catch (err) {
    log("❌", `Backup failed: ${err.message || err}`);
    process.exit(1);
  }
}
