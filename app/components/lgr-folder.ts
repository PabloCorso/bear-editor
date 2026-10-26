// Directory handles are persisted separately from imported LGR bytes.
const DB_NAME = "elma-lgr-folder";

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLgrFolder(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handles", "readonly");
    const request = tx.objectStore("handles").get("folder");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveLgrFolder(handle: FileSystemDirectoryHandle | null) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    const store = tx.objectStore("handles");
    if (handle) store.put(handle, "folder");
    else store.delete("folder");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listLgrFiles(handle: FileSystemDirectoryHandle) {
  const files: FileSystemFileHandle[] = [];
  for await (const [, entry] of handle.entries()) {
    if (entry.kind === "file" && /\.lgr$/i.test(entry.name)) {
      files.push(entry as FileSystemFileHandle);
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
