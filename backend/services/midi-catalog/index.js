// @ts-check
/**
 * In-memory MIDI catalog service backed by static index JSON.
 */
import { access, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { resolvePathWithinBase } from "../../helpers/safePath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_INDEX_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "midi-catalog",
  "index.json",
);
const CATALOG_FILES_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "midi-catalog",
  "files",
);

/** @type {Promise<any> | null} */
let catalogPromise = null;

function readUint32(data, offset) {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

function readUint16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function readVarLen(data, offset) {
  let value = 0;
  let i = offset;
  while (i < data.length) {
    const byte = data[i++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value, next: i };
}

function inspectMidiBuffer(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 14 || readUint32(data, 0) !== 0x4d546864) {
    return null;
  }

  const trackCount = readUint16(data, 10);
  const division = readUint16(data, 12);
  const ticksPerBeat = division & 0x8000 ? 480 : division;

  let offset = 14;
  let noteCount = 0;
  let maxTick = 0;
  let tempo = 120;

  while (offset + 8 <= data.length) {
    if (readUint32(data, offset) !== 0x4d54726b) break;
    const trackLength = readUint32(data, offset + 4);
    offset += 8;
    const trackEnd = offset + trackLength;
    let runningStatus = 0;
    let tick = 0;

    while (offset < trackEnd && offset < data.length) {
      const delta = readVarLen(data, offset);
      tick += delta.value;
      offset = delta.next;
      if (offset >= trackEnd) break;

      let status = data[offset];
      if (status < 0x80) {
        if (runningStatus === 0) break;
        status = runningStatus;
      } else {
        offset += 1;
        runningStatus = status;
      }

      const type = status & 0xf0;
      if (type === 0x90) {
        const _pitch = data[offset++];
        const velocity = data[offset++];
        if (velocity > 0) noteCount += 1;
        maxTick = Math.max(maxTick, tick);
      } else if (type === 0x80) {
        offset += 2;
        maxTick = Math.max(maxTick, tick);
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        offset += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        offset += 1;
      } else if (status === 0xff) {
        const metaType = data[offset++];
        const len = readVarLen(data, offset);
        offset = len.next;
        if (metaType === 0x51 && len.value === 3 && offset + 2 < trackEnd) {
          const microsecondsPerBeat =
            (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
          tempo = Math.round(60000000 / microsecondsPerBeat);
        }
        offset += len.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(data, offset);
        offset = len.next + len.value;
      } else {
        break;
      }
    }

    offset = trackEnd;
  }

  return {
    track_count: trackCount,
    note_count: noteCount,
    estimatedTempo: tempo,
    length: Math.max(1, Math.ceil(maxTick / ticksPerBeat)),
  };
}

/**
 * @returns {Promise<any>}
 */
async function loadCatalogIndex() {
  if (!catalogPromise) {
    catalogPromise = readFile(CATALOG_INDEX_PATH, "utf-8").then((raw) => {
      const catalog = JSON.parse(raw);
      const byId = {};
      const byGenre = {};
      const byType = {};
      const byKey = {};

      for (const entry of catalog.entries || []) {
        byId[entry.id] = entry;
        const genre = entry.category?.genre;
        if (genre) {
          if (!byGenre[genre]) byGenre[genre] = [];
          byGenre[genre].push(entry.id);
        }
        const type = entry.category?.type;
        if (type) {
          if (!byType[type]) byType[type] = [];
          byType[type].push(entry.id);
        }
        const key = entry.category?.key;
        if (key) {
          if (!byKey[key]) byKey[key] = [];
          byKey[key].push(entry.id);
        }
      }

      return {
        ...catalog,
        indices: { byId, byGenre, byType, byKey },
      };
    });
  }
  return catalogPromise;
}

/**
 * @param {any} query
 */
export async function searchCatalogEntries(query = {}) {
  const catalog = await loadCatalogIndex();
  let results = [...(catalog.entries || [])];

  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  if (q) {
    results = results.filter((entry) => {
      const haystack = [
        entry.title,
        ...(entry.tags || []),
        entry.category?.genre,
        entry.category?.key,
        entry.category?.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (query.genre) {
    results = results.filter((e) => e.category?.genre === query.genre);
  }
  if (query.type) {
    results = results.filter((e) => e.category?.type === query.type);
  }
  if (query.key) {
    results = results.filter((e) => e.category?.key === query.key);
  }
  if (query.complexity) {
    results = results.filter(
      (e) => e.category?.complexity === query.complexity,
    );
  }
  if (query.tempo) {
    results = results.filter((e) => e.category?.tempo === query.tempo);
  }
  if (query.minTempo !== undefined) {
    results = results.filter(
      (e) => (e.analysis?.estimatedTempo ?? 0) >= Number(query.minTempo),
    );
  }
  if (query.maxTempo !== undefined) {
    results = results.filter(
      (e) => (e.analysis?.estimatedTempo ?? 0) <= Number(query.maxTempo),
    );
  }

  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return {
    total: results.length,
    offset,
    limit,
    entries: results.slice(offset, offset + limit),
    statistics: catalog.statistics,
  };
}

/**
 * @param {string} id
 */
export async function getCatalogEntryById(id) {
  const catalog = await loadCatalogIndex();
  return catalog.indices.byId[id] || null;
}

/**
 * @param {string} id
 */
const CATALOG_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function resolveCatalogFilePath(id) {
  if (typeof id !== "string" || !CATALOG_ID_REGEX.test(id)) return null;
  return resolvePathWithinBase(CATALOG_FILES_DIR, `${id}.mid`);
}

export async function inspectCatalogHealth() {
  const catalog = await loadCatalogIndex();
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  const issues = [];
  let validFiles = 0;

  for (const entry of entries) {
    const filePath = resolveCatalogFilePath(entry.id);
    if (!filePath) {
      issues.push({
        id: entry.id,
        severity: "error",
        reason: "invalid_catalog_id",
      });
      continue;
    }

    try {
      await access(filePath);
    } catch {
      issues.push({
        id: entry.id,
        severity: "error",
        reason: "missing_file",
        file_path: filePath,
      });
      continue;
    }

    const midi = await readFile(filePath);
    const inspected = inspectMidiBuffer(midi);
    if (!inspected) {
      issues.push({
        id: entry.id,
        severity: "error",
        reason: "invalid_midi",
        file_path: filePath,
      });
      continue;
    }

    validFiles += 1;

    if (inspected.note_count <= 0) {
      issues.push({
        id: entry.id,
        severity: "error",
        reason: "empty_midi",
        file_path: filePath,
      });
    }

    const analysis = entry.analysis || {};
    for (const field of [
      "track_count",
      "note_count",
      "estimatedTempo",
      "length",
    ]) {
      if (analysis[field] !== inspected[field]) {
        issues.push({
          id: entry.id,
          severity: "error",
          reason: "metadata_mismatch",
          field,
          expected: analysis[field],
          actual: inspected[field],
        });
      }
    }
  }

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  return {
    status: errorCount === 0 ? "ok" : "degraded",
    generated_at: catalog.generated_at || null,
    index_path: CATALOG_INDEX_PATH,
    files_dir: CATALOG_FILES_DIR,
    total_entries: entries.length,
    valid_files: validFiles,
    issue_count: issues.length,
    issues,
    statistics: catalog.statistics || null,
  };
}

export { CATALOG_FILES_DIR, CATALOG_INDEX_PATH, inspectMidiBuffer };
