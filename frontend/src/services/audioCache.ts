const DB_NAME = 'burntbeats-audio-cache';
const DB_VERSION = 1;
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
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function cacheStem(id: string, url: string, arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const cached: CachedStem = {
      id,
      url,
      buffer: arrayBuffer,
      timestamp: Date.now(),
    };
    
    store.put(cached);
  } catch (error) {
    console.warn('Failed to cache stem:', error);
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
        if (result) {
          resolve(result.buffer);
        } else {
          resolve(null);
        }
      };
    });
  } catch (error) {
    console.warn('Failed to get cached stem:', error);
    return null;
  }
}

export async function getCachedStemByUrl(url: string): Promise<ArrayBuffer | null> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      let found: ArrayBuffer | null = null;
      
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const cached = cursor.value as CachedStem;
          if (cached.url === url) {
            found = cached.buffer;
          }
          cursor.continue();
        } else {
          resolve(found);
        }
      };
    });
  } catch (error) {
    console.warn('Failed to get cached stem by URL:', error);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  } catch (error) {
    console.warn('Failed to clear cache:', error);
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
  } catch (error) {
    return 0;
  }
}
