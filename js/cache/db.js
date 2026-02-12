// db.js — IndexedDB для постоянного хранения файлов модели

const DB_NAME = "arch-models-cache";
const DB_VERSION = 1;
const STORE = "files";

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getFile(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(url);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror  = () => reject(req.error);
  });
}

export async function saveFile(url, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, url);

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  });
}
