const DB_NAME = "elma-lgr-assets";
const STORE_NAME = "lgr";
const DEFAULT_LGR_KEY = "default-lgr";

export type StoredLgr = {
  name: string;
  levelName: string;
  data: ArrayBuffer;
};

export async function loadStoredLgrs(): Promise<StoredLgr[]> {
  if (!isClient()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const lgrs: StoredLgr[] = [];
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(lgrs);

    const request = tx.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (cursor.key !== DEFAULT_LGR_KEY) {
        lgrs.push(cursor.value);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadStoredLgr(
  levelName: string,
): Promise<StoredLgr | null> {
  if (!isClient()) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(STORE_NAME).get(getLgrKey(levelName));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStoredLgr(lgr: StoredLgr): Promise<void> {
  if (!isClient()) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(lgr, getLgrKey(lgr.levelName));
  });
}

async function openDb(): Promise<IDBDatabase> {
  if (!isClient()) {
    throw new Error("indexedDB is not available in this environment");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function isClient() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function getLgrKey(levelName: string) {
  return `lgr:${normalizeStoredLgrName(levelName)}`;
}

function normalizeStoredLgrName(levelName: string) {
  return levelName
    .trim()
    .toLowerCase()
    .replace(/\.lgr$/i, "");
}
