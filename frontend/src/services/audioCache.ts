const DB_NAME = 'burntbeats-audio-cache';
const DB_VERSION = 2; // bumped to add url index
const STORE_NAME = 'stems';

interface CachedStem {
  id: string;
  url: string;
  buffer: ArrayBuffer;
  timestamp: number;
}

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_url', 'url', { unique: false });
      } else {
        // Add index if upgrading from v1
        const store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains('by_url')) {
          store.createIndex('by_url', 'url', { unique: false });
        }
      }
    };
  });
}

export async function cacheStem(id: string, url: string, arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const cached: CachedStem = { id, url, buffer: arrayBuffer, timestamp: Date.now() };
    store.put(cached);
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Failed to cache stem:", error);
  }
}

export async function getCachedStem(id: string): Promise<ArrayBuffer | null> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedStem | undefined;
        resolve(result?.buffer ?? null);
      };
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Failed to get cached stem:", error);
    return null;
  }
}

/** O(log n) URL lookup via index — replaces the old full cursor scan. */
export async function getCachedStemByUrl(url: string): Promise<ArrayBuffer | null> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('by_url');

    return new Promise((resolve, reject) => {
      const request = index.get(url);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedStem | undefined;
        resolve(result?.buffer ?? null);
      };
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Failed to get cached stem by URL:", error);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Failed to clear cache:", error);
  }
}

export async function getCacheSize(): Promise<number> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch {
    return 0;
  }
}
