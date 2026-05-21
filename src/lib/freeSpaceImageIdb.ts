/**
 * Local-only image blob storage for Free Space spatial image objects (IndexedDB).
 * Keys are scoped by section + object id. No network.
 */

const DB_NAME = 'fw_free_space_image_v1';
const STORE = 'blobs';
const DB_VERSION = 1;

function storeKey(sectionId: string, objectId: string): string {
  return `${sectionId}::${objectId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveImageBlob(sectionId: string, objectId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).put(blob, storeKey(sectionId, objectId));
  });
}

export async function loadImageBlob(sectionId: string, objectId: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(storeKey(sectionId, objectId));
    req.onsuccess = () => {
      db.close();
      resolve(req.result instanceof Blob ? req.result : undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteImageBlob(sectionId: string, objectId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).delete(storeKey(sectionId, objectId));
  });
}

export async function copyImageBlob(
  sectionId: string,
  fromObjectId: string,
  toObjectId: string,
): Promise<boolean> {
  try {
    const blob = await loadImageBlob(sectionId, fromObjectId);
    if (!blob) return false;
    await saveImageBlob(sectionId, toObjectId, blob);
    return true;
  } catch {
    return false;
  }
}

export function isAcceptableImageFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/svg+xml') return false;
  if (t.startsWith('image/')) return true;
  const n = file.name.toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|heif)$/.test(n);
}

export function readImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        w: img.naturalWidth > 0 ? img.naturalWidth : 360,
        h: img.naturalHeight > 0 ? img.naturalHeight : 280,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ w: 360, h: 280 });
    };
    img.src = url;
  });
}

export function fitImageFrame(
  naturalWidth: number,
  naturalHeight: number,
  maxW = 480,
  maxH = 420,
): { w: number; h: number } {
  const aspect = naturalWidth / Math.max(1, naturalHeight);
  let w = Math.min(maxW, naturalWidth);
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return {
    w: Math.round(Math.max(160, w)),
    h: Math.round(Math.max(120, h)),
  };
}
