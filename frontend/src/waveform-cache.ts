/**
 * IndexedDB cache for stem waveforms so we don't recompute on every mount.
 * Key: stem URL + bin count. Value: number[] (peak envelope).
 */

const DB_NAME = "burntbeats-waveforms";
const STORE_NAME = "stemWaveforms";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
  });
}

function cacheKey(url: string, bins: number): string {
  return `${url}|${bins}`;
}

export async function getStemWaveform(
  url: string,
  bins: number
): Promise<number[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(cacheKey(url, bins));
    req.onsuccess = () => {
      const row = req.result as { key: string; data: number[] } | undefined;
      if (row?.data?.length === bins) resolve(row.data);
      else resolve(null);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function setStemWaveform(
  url: string,
  bins: number,
  data: number[]
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put({
      key: cacheKey(url, bins),
      data,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
