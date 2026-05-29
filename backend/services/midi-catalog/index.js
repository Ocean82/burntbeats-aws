// @ts-check
/**
 * In-memory MIDI catalog service backed by static index JSON.
 */
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_INDEX_PATH = path.join(__dirname, "..", "..", "data", "midi-catalog", "index.json");
const CATALOG_FILES_DIR = path.join(__dirname, "..", "..", "data", "midi-catalog", "files");

/** @type {Promise<any> | null} */
let catalogPromise = null;

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
    results = results.filter((e) => e.category?.complexity === query.complexity);
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
export function resolveCatalogFilePath(id) {
  return path.join(CATALOG_FILES_DIR, `${id}.mid`);
}

export { CATALOG_FILES_DIR, CATALOG_INDEX_PATH };
