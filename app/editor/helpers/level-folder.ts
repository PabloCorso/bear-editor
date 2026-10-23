import type { EditorStore } from "~/editor/editor-store";

const DB_NAME = "elma-level-folder";
const STORE_NAME = "handles";
const LEVEL_FOLDER_KEY = "level-folder";

export class LevelFolder {
  private store: EditorStore;
  private handle?: FileSystemDirectoryHandle;
  private folderName?: string;
  private loadPromise: Promise<boolean>;

  constructor(store: EditorStore) {
    this.store = store;
    this.loadPromise = this.loadFromStorage();
  }

  get name() {
    return this.handle?.name ?? this.folderName;
  }

  get directoryHandle() {
    return this.handle;
  }

  hasFolder() {
    return Boolean(this.handle);
  }

  async loadFromStorage() {
    if (!isClient()) return false;
    const handle = await loadHandle(LEVEL_FOLDER_KEY);
    if (!handle) {
      this.handle = undefined;
      this.folderName = undefined;
      return false;
    }
    this.handle = handle;
    this.folderName = handle.name;
    return true;
  }

  async ready() {
    return this.loadPromise;
  }

  async pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({
        id: DB_NAME,
        mode: "readwrite",
      });
      this.handle = handle;
      this.folderName = handle.name;
      this.loadPromise = Promise.resolve(true);
      await persistHandle(LEVEL_FOLDER_KEY, handle);
      return true;
    } catch (err: any) {
      if (err?.name === "AbortError") return false;
      throw err;
    }
  }

  async ensureAccess(write = false) {
    await this.ready();
    if (!this.handle) return false;
    const opts = write ? { mode: "readwrite" } : { mode: "read" };
    if ((await this.handle.queryPermission(opts)) === "granted") return true;
    return (await this.handle.requestPermission(opts)) === "granted";
  }

  async hasAccess(write = false) {
    await this.ready();
    if (!this.handle) return false;
    const opts = write ? { mode: "readwrite" } : { mode: "read" };
    return (await this.handle.queryPermission(opts)) === "granted";
  }

  async listLevels() {
    await this.ready();
    if (!this.handle) return [];
    const names: string[] = [];
    for await (const [name, entry] of this.handle.entries()) {
      if (entry.kind === "file" && name.endsWith(".lev")) names.push(name);
    }
    return names;
  }

  async readLevel(name: string) {
    const handle = await this.getLevelFileHandle(name);
    const file = await handle.getFile();
    return file.arrayBuffer();
  }

  async getLevelFileHandle(name: string) {
    await this.ready();
    if (!this.handle) throw new Error("Level folder is not set");
    return this.handle.getFileHandle(name);
  }

  async writeLevel(name: string, data: BlobPart) {
    await this.ready();
    if (!this.handle) throw new Error("Level folder is not set");
    const handle = await this.handle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async forget() {
    this.handle = undefined;
    this.folderName = undefined;
    this.loadPromise = Promise.resolve(false);
    await deleteHandle(LEVEL_FOLDER_KEY);
  }
}

async function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
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

async function persistHandle(
  key: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(handle, key);
  });
}

async function loadHandle(
  key: string,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteHandle(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(key);
  });
}

function isClient() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}
